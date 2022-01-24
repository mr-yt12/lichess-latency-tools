// ==UserScript==
// @name         Lag Measurer v2
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  BETA testing of various latency measuring tools
// @author       You
// @include      /^https:\/\/lichess\.org\/(\w{8}|\w{12})$/
// @icon         https://www.google.com/s2/favicons?domain=lichess.org
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (
    Array.from(document.getElementsByTagName('script')).find((script) =>
      script.src.includes('analysisBoard')
    ) ||
    Array.from(document.getElementsByClassName('rclock')).find((clock) =>
      clock.className.includes('outoftime')
    ) ||
    !document
      .getElementsByClassName('ruser-bottom')[0]
      ?.getElementsByClassName('text')[0]
      ?.innerText?.toLowerCase()
      .includes(document.body.dataset.user)
  ) {
    return;
  }

  let plrTimeRunning = false;
  let oppTimeRunning = false;

  let totalOppElapsed = 0;
  let totalPlrElapsed = 0;

  let lichessReportedOppTime;
  let lichessReportedPlrTime;

  let plrColor;
  let oppColor;

  let lastTimeSpentByOpp;

  let time = 0;

  let gameStarted = false;
  let gameStartTime;

  let initialPlrTime;
  let initialOppTime;

  let lastAmountOfCommonCompensatedLagAndDelays = 0;

  let serverLag = 1;

  let startedReceivingServerLag = false;

  let lagSpans;

  let firstPlayerLagMeasurement = true;

  function findClosingBracketMatchIndex(str, pos) {
    //https://codereview.stackexchange.com/questions/179471/find-the-corresponding-closing-parenthesis
    if (str[pos] !== '{') {
      throw new Error("No '{' at index " + pos);
    }
    let depth = 1;
    for (let i = pos + 1; i < str.length; i++) {
      switch (str[i]) {
        case '{':
          depth++;
          break;
        case '}':
          if (--depth == 0) {
            return i;
          }
          break;
      }
    }
    return -1; // No matching closing parenthesis
  }

  const startObserving = () => {
    const timeOpp = document.getElementsByClassName('rclock rclock-top')[0];
    const timePlr = document.getElementsByClassName('rclock rclock-bottom')[0];

    // opp's clock
    new MutationObserver((mutations, observer) => {
      if (
        timePlr.className.includes('outoftime') ||
        timeOpp.className.includes('outoftime')
      ) {
        return;
      }
      if (Array.from(timeOpp.classList).includes('running')) {
        if (oppTimeRunning === true) {
          return;
        }
        oppTimeRunning = true;
        const timeSinceSincePlrTimePaused = performance.now() - time;
        console.log('- opp Time Started', timeSinceSincePlrTimePaused);
        console.log('PLAYER`S PING: ', timeSinceSincePlrTimePaused);

        time = performance.now();
        if (gameStarted === false) {
          gameStartTime = performance.now();
          gameStarted = true;
          initialPlrTime = lichessReportedPlrTime;
          initialOppTime = lichessReportedOppTime;
        }
        if (firstPlayerLagMeasurement) {
          firstPlayerLagMeasurement = false;
          return;
        }
        lagSpans[0].innerText = timeSinceSincePlrTimePaused.toFixed(0);
      } else {
        if (oppTimeRunning === false) {
          return;
        }
        oppTimeRunning = false;
        const timeSinceOppClockLastStarted = performance.now() - time;
        console.log('- opp Time Paused', timeSinceOppClockLastStarted);
        const oppPing = timeSinceOppClockLastStarted - lastTimeSpentByOpp;
        console.log('OPP PING', oppPing);
        lagSpans[1].innerText = oppPing.toFixed(0);
        time = performance.now();
      }
    }).observe(timeOpp, {
      attributes: true,
    });

    // player's clock
    new MutationObserver((mutations, observer) => {
      if (
        timePlr.className.includes('outoftime') ||
        timeOpp.className.includes('outoftime')
      ) {
        return;
      }
      if (Array.from(timePlr.classList).includes('running')) {
        if (plrTimeRunning === true) {
          return;
        }
        plrTimeRunning = true;
        console.log('- player Time Started', performance.now() - time);
        time = performance.now();
        if (gameStarted === false) {
          gameStartTime = performance.now();
          gameStarted = true;
          initialPlrTime = lichessReportedPlrTime;
          initialOppTime = lichessReportedOppTime;
        }
      } else {
        if (plrTimeRunning === false) {
          return;
        }
        plrTimeRunning = false;
        const plrElapsed = performance.now() - time;
        totalPlrElapsed += plrElapsed <= 10 ? 0 : plrElapsed;
        console.log('- player Time Paused', plrElapsed, totalPlrElapsed);
        time = performance.now();
      }
    }).observe(timePlr, {
      attributes: true,
    });
  };

  const generalMutations = () => {
    const timeOppTime = document.querySelector(
      '#main-wrap > main > div.round__app.variant-standard > div.rclock.rclock-top > div'
    );
    let time = 0;
    new MutationObserver((mutations, observer) => {
      const timeSinceLastMutation = performance.now() - time;
      if (
        Math.abs(
          Math.round(timeSinceLastMutation / 100) * 100 - timeSinceLastMutation
        ) <= 3
      ) {
        return;
      }
      console.log(timeSinceLastMutation);
      time = performance.now();
    }).observe(timeOppTime, { childList: true, subtree: true });
  };

  const getInitialClock = (scriptText) => {
    if (!scriptText) {
      return;
    }
    const indexOfBoot = scriptText.indexOf('boot(') + 5;
    const parsableGameInfo = scriptText.substr(indexOfBoot);
    const positionOfTheClosingBracket = findClosingBracketMatchIndex(
      parsableGameInfo,
      0
    );
    const parsableGameInfoFinal = parsableGameInfo.substr(
      0,
      positionOfTheClosingBracket + 1
    );
    let gameInfo;
    try {
      gameInfo = JSON.parse(parsableGameInfoFinal);
    } catch (e) {
      console.log(e);
      parsableGameInfoFinal = parsableGameInfo.substr(
        0,
        parsableGameInfo.length - 3
      );
      try {
        gameInfo = JSON.parse(parsableGameInfoFinal);
      } catch (e) {
        console.log(e);
        alert('Cannot parse JSON');
      }
    }
    plrColor = gameInfo.data.player.color;
    oppColor = gameInfo.data.opponent.color;
    lichessReportedOppTime = gameInfo.data.clock[oppColor] * 1000;
    lichessReportedPlrTime = gameInfo.data.clock[plrColor] * 1000;
  };

  const waitForData = () => {
    const scriptArr = Array.from(
      document.getElementsByTagName('script')
    ).filter(
      (script) => script.textContent.indexOf('lichess.load.then(') === 0
    );
    if (scriptArr.length >= 1) {
      getInitialClock(scriptArr[0].text);
    } else {
      new MutationObserver((mutations, observer) => {
        mutations.forEach((mutation) => {
          if (
            mutation?.addedNodes[0]?.tagName?.toLowerCase() === 'script' &&
            mutation.addedNodes[0].text.indexOf('lichess.load.then(') === 0
          ) {
            observer.disconnect();
            getInitialClock(mutation.addedNodes[0].text);
          }
        });
      }).observe(document, { childList: true, subtree: true });
    }
  };

  const addSocketListeners = () => {
    window.lichess.pubsub.on('socket.in.move', (d) => {
      if (d.lag) {
        serverLag = d.lag;
        console.log('d.lag', d.lag);
        startedReceivingServerLag = true;
        lagSpans[2].innerText = serverLag;
      }
      const previousLichessReportedOppTime = lichessReportedOppTime;
      const previousLichessReportedPlrTime = lichessReportedPlrTime;

      lichessReportedOppTime = d.clock[oppColor] * 1000;
      lichessReportedPlrTime = d.clock[plrColor] * 1000;
      lastTimeSpentByOpp =
        previousLichessReportedOppTime - lichessReportedOppTime;
      console.log(
        'socket.in.move',
        `opp: ${lichessReportedOppTime}`,
        `plr: ${lichessReportedPlrTime}`
      );
      if (gameStartTime) {
        const timePassedOnClockSinceGameStart =
          initialPlrTime -
          lichessReportedPlrTime +
          (initialOppTime - lichessReportedOppTime);
        const timePassedInRealLife = performance.now() - gameStartTime;
        const amountOfCommonCompensatedLagAndDelays =
          timePassedInRealLife - timePassedOnClockSinceGameStart;

        const plrsMove =
          plrColor === 'white'
            ? d.ply % 2 === 1
              ? true
              : false
            : d.ply % 2 === 0
            ? true
            : false;

        console.log(
          'this was player`s move: ',
          plrsMove,
          amountOfCommonCompensatedLagAndDelays,
          amountOfCommonCompensatedLagAndDelays -
            lastAmountOfCommonCompensatedLagAndDelays
        );

        lastAmountOfCommonCompensatedLagAndDelays =
          amountOfCommonCompensatedLagAndDelays;
      }
    });

    window.lichess.pubsub.on('socket.in.mlat', (d) => {
      console.log(d);
      serverLag = d;
      lagSpans[2].innerText = serverLag;
      startedReceivingServerLag = true;
    });
  };

  const checkSocketListeners = () => {
    if (window.lichess.pubsub) {
      addSocketListeners();
    } else {
      Object.defineProperty(window.lichess, 'pubsub', {
        set: function (value) {
          Object.defineProperty(window.lichess, 'pubsub', {
            value,
          });
          addSocketListeners();
        },
        configurable: true,
      });
    }
  };

  const startReceivingServerLag = () => {
    const mouseoverEvent = new Event('mouseover');
    window.user_tag.dispatchEvent(mouseoverEvent);
    let userTagInterval = setInterval(function () {
      if (startedReceivingServerLag) {
        clearInterval(userTagInterval);
        return;
      }
      window.user_tag.dispatchEvent(mouseoverEvent);
      console.log('userTagInterval');
    }, 100);
  };

  const createDisplay = async () => {
    const div = document.createElement('div');
    const parentEl =
      document.getElementById('main-wrap') ||
      (await new Promise((resolve, reject) => {
        new MutationObserver((mutations, observer) => {
          const parentEl = document.getElementById('main-wrap');
          if (parentEl) {
            observer.disconnect();
            resolve(parentEl);
          }
        }).observe(document, { childList: true, subtree: true });
      }));
    parentEl.appendChild(div);
    div.id = 'lag-measurer';
    div.innerHTML = `
    <style>
    .lag-div {
      color: #a39a9a;
    }
  
    .lag-span {
      color: red;
    }
  </style>
  <div class="lag-div">Your Lag:</div>
  <span class="lag-span">?</span>
  <div class="lag-div">Opp's Lag:</div>
  <span class="lag-span">?</span>
  <div class="lag-div">Server Lag:</div>
  <span class="lag-span">?</span>
  <a href="https://github.com/mr-yt12/Lichess-latency-tools">Info</a>  
    `;
    lagSpans = div.getElementsByClassName('lag-span');
  };

  new MutationObserver((mutations, observer) => {
    if (document.getElementsByClassName('rclock').length === 2) {
      observer.disconnect();
      createDisplay();
      startObserving();
      // generalMutations();
      waitForData();
    }
  }).observe(document, { childList: true, subtree: true });

  new MutationObserver((mutations, observer) => {
    if (!window.user_tag) {
      return;
    }
    observer.disconnect();
    startReceivingServerLag();
  }).observe(document, {
    childList: true,
    subtree: true,
  });

  checkSocketListeners();
})();
