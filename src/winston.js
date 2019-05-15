import { createLogger, format, transports } from 'winston';
import _ from 'lodash';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const logDir = 'logs';

// Create the log directory if it does not exist
if (!existsSync(logDir)) {
    mkdirSync(logDir);
}

const filename = join(logDir, 'connector.log');

// instantiate a new Winston Logger with the settings defined above
const logger = createLogger({
    level: 'info',
    // format: format.json(),
    format: format.combine(
        format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        format.printf(
            info => `${info.timestamp} ${info.level}: ${info.message}`
        )
    ),
    transports: [
        new transports.Console({
            level: 'info',
            format: format.combine(
                format.colorize(),
                format.printf(
                    info => `${info.timestamp} ${info.level}: ${info.message}`
                )
            )
        }),
        new transports.File({filename})
    ],
    exitOnError: false, // do not exit on handled exceptions
});

// create a stream object with a 'write' function that will be used by `morgan`
logger.stream = {
    write: function (message, encoding) {
        logger.info(message);
    },
};

export default logger;
