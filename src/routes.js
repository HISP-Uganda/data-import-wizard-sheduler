import ScheduleModel from './ScheduleModel';

export const routes = (app, io) => {
    app.post('/schedules', async (req, res) => {
        const data = req.body;
        const job = await ScheduleModel.create(data);
        return res.status(201).send(job);
    });

    app.get('/info', (req, res) => {
        return res.status(201).send(ScheduleModel.data);
    });

    app.get('/schedules', async (req, res) => {
        const schedules = ScheduleModel.findAll()
        return res.status(201).send(schedules);
    });

    app.post('/proxy', async (req, res) => {
        const { url, username, password, params } = req.body;
        try {
            const { data } = await ScheduleModel.getData(url, params, username, password);
            return res.status(200).send(data);
        } catch (e) {
            return res.status(500).send({ message: e.message });
        }
    });

    app.post('/stop', (req, res) => {
        return res.status(201).send(ScheduleModel.stop(req.body.id));
    });

    app.get('/schedules/:id', (req, res) => {
        return res.status(201).send(ScheduleModel.findOne(req.params.id));
    });

    app.put('/schedules/:id', (req, res) => {
        return res.status(201).send(ScheduleModel.update(req.params.id));
    });

    app.delete('/schedules/:id', (req, res) => {
        return res.status(201).send(ScheduleModel.delete(req.params.id));
    });
};