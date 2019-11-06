import express from 'express';
import bodyParser from 'body-parser';
import cors from "cors";
import socket from 'socket.io';
import http from 'http';
import { routes } from './routes';

const app = express();

app.use(bodyParser.json({ limit: '100mb' }));
app.use(cors());

const server = http.createServer(app).listen(3001, () => {
    console.log('HTTP server listening on port 3001');
});

let io = socket.listen(server);
io.on('connection', (socket) => {
    socket.on('message', (data) => {
        console.log(data);
    });
    socket.on("disconnect", () => console.log("Client disconnected"));
});

routes(app, io);