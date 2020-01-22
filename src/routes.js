import ScheduleModel from './ScheduleModel';
import moment from 'moment';

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

    app.get('/data', async (req, res) => {

        let params = {};
        if (req.query.voucher_type) {
            params = { ...params, voucher_type: req.query.voucher_type }
        }

        if (req.query.from) {
            params = { ...params, from: req.query.from }
        }

        if (req.query.to) {
            params = { ...params, to: req.query.to }
        }

        if (req.query.limit) {
            params = { ...params, limit: req.query.limit }
        }

        let currentData = [];

        // try {
        let { data: { results, ...rest } } = await ScheduleModel.getData2(params);
        let next = rest.next;

        let currentResults = results.map(r => {
            return {
                ...r,
                orgUnit: 'XVi4D1VcRN6',
                name: String(`${r.first_name ? r.first_name : ''} ${r.maiden_name ? r.maiden_name : ''} ${r.last_name ? r.last_name : ''}`.replace(/\s{2,}/g, ' ')).trim(),
                created_at: moment(r.created_at).format('YYYY-MM-DDTHH:mm')
            }
        });
        currentData = [...currentData, ...currentResults];
        while (next && next !== null) {
            const currentURL = new URL(next);
            const params = Object.fromEntries(currentURL.searchParams);
            let { data: { results, ...rest } } = await ScheduleModel.getData2(params);
            let currentResults = results.map(r => {
                return {
                    ...r,
                    orgUnit: 'XVi4D1VcRN6',
                    name: String(`${r.first_name ? r.first_name : ''} ${r.maiden_name ? r.maiden_name : ''} ${r.last_name ? r.last_name : ''}`.replace(/\s{2,}/g, ' ')).trim(),
                    created_at: moment(r.created_at).format('YYYY-MM-DDTHH:mm')
                }
            });
            currentData = [...currentData, ...currentResults];
            next = rest.next;
        }
        return res.status(200).send(currentData);
        // } catch (e) {
        //     return res.status(500).send({ message: e.message });
        // }
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