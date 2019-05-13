// import alasql from 'alasql';
// import {getValidationRules} from "./data-utils";

// const dataValues = require('./datavalues.json');
import express from 'express';
import Schedule from './ScheduleController';
import bodyParser from 'body-parser';
import cors from "cors";


const app = express();
app.use(bodyParser.json({limit: '50mb'}));
app.use(cors());
app.post('/api/v1/schedules', Schedule.create);
app.get('/api/v1/schedules', Schedule.getAll);
app.get('/api/v1/info', Schedule.info);
app.post('/api/v1/stop', Schedule.stop);
app.get('/api/v1/schedules/:id', Schedule.getOne);
app.put('/api/v1/schedules/:id', Schedule.update);
app.delete('/api/v1/schedules/:id', Schedule.delete);

app.listen(3001);

console.log('Server running at http://localhost:3001/');

// getValidationRules().then(data => {
//     const {validationRules} = data;
//
//     console.log(validationRules);
// });

