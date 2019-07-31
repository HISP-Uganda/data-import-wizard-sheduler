// import alasql from 'alasql';
// import {getValidationRules} from "./data-utils";

// const dataValues = require('./datavalues.json');
import express from 'express';
import Schedule from './ScheduleController';
import bodyParser from 'body-parser';
import cors from "cors";


const app = express();
app.use(bodyParser.json({limit: '100mb'}));
app.use(cors());
app.post('/schedules', Schedule.create);
app.get('/schedules', Schedule.getAll);
app.get('/info', Schedule.info);
app.post('/stop', Schedule.stop);
app.get('/schedules/:id', Schedule.getOne);
app.post('/proxy', Schedule.getData);
app.put('/schedules/:id', Schedule.update);
app.delete('/schedules/:id', Schedule.delete);

app.listen(3001);

console.log('Server running at http://localhost:3001/');

