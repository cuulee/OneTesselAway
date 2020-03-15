/**
 * OneTesselAway - OneBusAway for the Tessel 2
 *
 * Display: 2 lines w/ 16 characters each. Example display:
 *
 *  ----------------
 *  11! 15:37 15:49
 *  12  08:11 06:47
 *  ----------------
 *
 *  ----------------
 *  11: 03!  15  45
 *  12: 18   32  51
 *  ----------------
 *
 * Supports up to two routes and two stops.
 */
const http = require('http');
const Express = require('express');
const constants = require('./src/Constants');
const { initLogger } = require('./src/Logger');
const { setTrafficLightState } = require('./src/hardware/TrafficLight');
const { triggerAlarmBuzzer } = require('./src/hardware/Alarm');
const {
    getDeviceState,
    processDeviceStateForDisplay,
    updateArrivalInfo,
} = require('./src/DeviceState');

// Helper Functions / Data -----------------------------------------------------

// Update arrivals from API and hardware from state
const updateArrivalsAndHardware = async () => {
    // Fetch a new arrival info synchronously
    await updateArrivalInfo(constants.TARGET_ROUTES);

    // Grab the updated device state
    const currentDeviceState = getDeviceState();

    if (DEVICE_ENABLED) {
        // Set the traffic light state and trigger buzzer based on arrival
        // of next bus on primary route
        setTrafficLightState(currentDeviceState.stoplightState);
        triggerAlarmBuzzer({
            piezoPin: constants.PIEZO_PIN,
            piezoPort: constants.PIEZO_PORT,
            trafficLightState: currentDeviceState.stoplightState,
        });

        // Update LCD. Do last b/c it's very slow.
        updateLcdScreen(currentDeviceState.displayLines);
    }

    // Send device state to the Web UI
    io.emit(
        'deviceStateUpdated',
        processDeviceStateForDisplay(currentDeviceState),
    );
};

// Initialize ------------------------------------------------------------------

// Set up logger
const log = initLogger(constants.LOGFILE);

log.info('Initializing OneTesselAway...');

// Should we enable the device, or run in web-only mode?
const DEVICE_ENABLED = process.env.DISABLE_DEVICE !== '1';

// Don't try to require the hardware module unless we're running on the actual
// device to prevent global import errors
let initHardware, updateLcdScreen;
if (DEVICE_ENABLED) {
    const hardware = require('./src/hardware');
    const lcdScreen = require('./src/hardware/LcdScreen');
    initHardware = hardware.initHardware;
    updateLcdScreen = lcdScreen.updateLcdScreen;
}

// Set up Express server for the web UI
var app = new Express();
var server = new http.Server(app);

// Set up the templating engine
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

// Set up Socket.io for sending data to the Web UI w/o refreshing the page
var io = require('socket.io')(server);

// Route to index. Render initial Web UI server-side.
app.get('/', (req, res) => {
    log.info(
        `IP address ${req.ip} requesting ${req.method} from path ${req.url}`,
    );
    const currentDeviceState = getDeviceState();
    res.render('index', processDeviceStateForDisplay(currentDeviceState));
});

// Start -----------------------------------------------------------------------

// Initialize hardware and set up update loop. Needs to be wrapped in an async
// function to assure hardware is initialized and initial data is fetched
// before starting
(async () => {
    if (DEVICE_ENABLED) {
        log.info('Initializing hardware device...');
        await initHardware({
            buttonAlarmTogglePin: constants.BUTTON_ALARM_PIN,
            lcdPins: constants.LCD_DISPLAY_PINS,
            ledAlarmStatusPin: constants.LED_ALARM_STATUS_PIN,
            ledMissPin: constants.LED_MISS_PIN,
            ledReadyPin: constants.LED_READY_PIN,
            ledSteadyPin: constants.LED_SET_PIN,
            piezoPin: constants.PIEZO_PIN,
            piezoPort: constants.PIEZO_PORT,
        });
    } else {
        log.info('Hardware device DISABLED. Starting web UI only...');
    }

    // Begin updating arrival info and LCD screen regularly
    log.info('Starting OneTesselAway...');
    log.info(
        `Begin updating arrival info ${
            DEVICE_ENABLED ? 'and LCD screen ' : ''
        }every ${constants.API_UPDATE_INTERVAL} milliseconds`,
    );

    if (DEVICE_ENABLED) {
        updateLcdScreen(['Getting bus', 'arrival info...']);
    }

    // Wait for the first arrival info to return before starting up
    await updateArrivalsAndHardware();

    // After the initial API fetch, continue updating asynchronously
    const apiIntervalId = setInterval(
        updateArrivalsAndHardware,
        constants.API_UPDATE_INTERVAL,
    );

    // Start up web UI server
    server = server.listen(constants.PORT);
    log.info(`Web UI server address: ${constants.ADDRESS}:${constants.PORT}`);

    // Shut down everything on ^C
    process.on('SIGINT', () => {
        log.info('Shutting down...');
        clearInterval(apiIntervalId);
        clearInterval(hardwareIntervalId);
        server.close();
    });
})();
