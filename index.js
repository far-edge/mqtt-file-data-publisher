const fs = require('fs');
const Joi = require('joi');
const mqtt = require('mqtt');
const winston = require('winston');

// Configure the logger.
const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)(Object.assign({
      json: false,
      prettyPrint: true,
      humanReadableUnhandledException: true,
      colorize: true,
      level: process.env.LOG_LEVEL,
      timestamp: true,
      silent: process.env.NODE_ENV === 'test'
    }))
  ]
});

// Validate the environment.
const schema = Joi.object({
  INITIAL_DELAY: Joi.number().min(1).required(),
  LOG_LEVEL: Joi.string().allow([
    'debug',
    'error',
    'info',
    'warn'
  ]).required(),
  MQTT_BROKER_URL: Joi.string().required(),
  MQTT_TOPIC: Joi.string().required(),
  NAME: Joi.string().required(),
  NODE_ENV: Joi.string().allow([
    'development',
    'production',
    'staging',
    'test'
  ]).required(),
  VALUE_FILE: Joi.string().required(),
  VALUE_INTERVAL: Joi.number().min(1).required()
}).unknown().required();
const { error, value: _env } = Joi.validate(process.env, schema);
if (error) {
  logger.error(`The environment is invalid (cause: ${ error.details[0].message }).`);
  process.exit(23);
}

// Load the values from the file, and sort them based on their end date.
const values = JSON.parse(fs.readFileSync(process.env.VALUE_FILE, 'utf8'));
values.sort((a, b) => {
  return Date.parse(a.endDate) < Date.parse(b.endDate);
});

// Connect to the MQTT broker.
logger.info(`System connects to the MQTT broker @ ${process.env.MQTT_BROKER_URL}.`);
const client = mqtt.connect(process.env.MQTT_BROKER_URL, {
  connectTimeout: 5
});

let connected = false;

client.on('connect', () => {
  logger.info(`System connected to the MQTT broker @ ${process.env.MQTT_BROKER_URL}.`);
  connected = true;

  // Subscribe to the topic.
  const topic = process.env.MQTT_TOPIC;
  logger.debug(`Subscribe to topic ${topic}.`);
  client.subscribe(topic);
  logger.debug(`Subscribed to topic ${topic}.`);

  let interval = 0;
  let index = 0;
  setTimeout(() => {
    // A function that publishes the next value from the array.
    const publishValue = (index) => {
      if (index >= values.length) {
        clearInterval(interval);
        logger.info(`File data publisher for topic ${ process.env.MQTT_TOPIC } stopped.`);
        process.exit(0);
      }
      const value = JSON.stringify(values[index]);
      logger.debug(`Publish value ${value} to topic ${topic}.`);
      client.publish(topic, value);
      logger.debug(`Published value ${value} to topic ${topic}.`);
    };
    publishValue(index++);
    interval = setInterval(() => {
      publishValue(index++);
    }, parseInt(process.env.VALUE_INTERVAL) * 1000);
  }, parseInt(process.env.INITIAL_DELAY) * 1000);
});

client.on('error', (error) => {
  logger.error('Something went wrong.', error);
});

// NOTE: No error event is sent when connection fails. The code below can be removed when
// https://github.com/GladysAssistant/Gladys/issues/540 is fixed.
setTimeout(() => {
  if (connected) {
    return;
  }
  logger.error(`System failed to connect to the MQTT broker @ ${process.env.MQTT_BROKER_URL}.`);
  process.exit(42);
}, 30 * 1000);

if (!module.parent) {
  logger.info(`File data publisher for topic ${ process.env.MQTT_TOPIC } started.`);
}
