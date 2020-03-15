const five = require('johnny-five');
const { wait } = require('../AsyncRepeatUtils');
const constants = require('../Constants');

const strobeDuration = 1000;
const leds = {
    [constants.STOPLIGHT_STATES.READY]: null,
    [constants.STOPLIGHT_STATES.STEADY]: null,
    [constants.STOPLIGHT_STATES.MISS]: null,
};

const initTrafficLight = ({ ledReadyPin, ledSteadyPin, ledMissPin }) => {
    leds[constants.STOPLIGHT_STATES.READY] = new five.Led(ledReadyPin);
    leds[constants.STOPLIGHT_STATES.STEADY] = new five.Led(ledSteadyPin);
    leds[constants.STOPLIGHT_STATES.MISS] = new five.Led(ledMissPin);
};

// Enable one of the traffic light states. The special state 'go' means to set state of all at once.
// Keep track of previous set state so we don't update unnecessarily
let previousSetState = null;
const setTrafficLightState = stateId => {
    if (stateId !== previousSetState) {
        Object.keys(leds).forEach(led => {
            leds[led].stop().off();
        });

        setTimeout(() => {
            if (stateId === constants.STOPLIGHT_STATES.GO) {
                Object.keys(leds).forEach(led => {
                    leds[led].strobe(strobeDuration);
                });
            } else {
                leds[stateId].strobe(strobeDuration);
            }
        }, 250);

        previousSetState = stateId;
    }
};

// Cycle through a list of states
const cycleStates = async ({ cycleCount, cycleDelay, stateList }) => {
    for (ii = 0; ii < cycleCount; ++ii) {
        for (i = 0; i < stateList.length; ++i) {
            stateList.forEach(stateId => {
                leds[stateId].off();
            });
            leds[stateList[i]].on();
            await wait(cycleDelay);
        }
    }
    stateList.forEach(stateId => {
        leds[stateId].off();
    });
};

module.exports = {
    cycleStates,
    getLeds: () => leds,
    initTrafficLight,
    setTrafficLightState,
};
