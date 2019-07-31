import Schedule from './ScheduleModel';

const ScheduleController = {
    /**
     *
     * @param {object} req
     * @param {object} res
     * @returns {object} schedule object
     */
    create(req, res) {
        const schedule = Schedule.create(req.body);
        return res.status(201).send(schedule);
    },

    stop(req, res) {
        const schedule = Schedule.stop(req.body.name);
        return res.status(201).send(schedule);
    },
    /**
     *
     * @param {object} req
     * @param {object} res
     * @returns {object} schedules array
     */
    getAll(req, res) {
        const schedules = Schedule.findAll();
        return res.status(200).send(schedules);
    },
    /**
     *
     * @param {object} req
     * @param {object} res
     * @returns {object} schedule object
     */
    getOne(req, res) {
        const schedule = Schedule.findOne(req.params.id);
        if (!schedule) {
            return res.status(404).send({'message': 'schedule not found'});
        }
        return res.status(200).send(schedule);
    },
    /**
     *
     * @param {object} req
     * @param {object} res
     * @returns {object} updated schedule
     */
    update(req, res) {
        const schedule = Schedule.findOne(req.params.id);
        if (!schedule) {
            return res.status(404).send({'message': 'schedule not found'});
        }
        const updatedSchedule = Schedule.update(req.params.id, req.body);
        return res.status(200).send(updatedSchedule);
    },
    /**
     *
     * @param {object} req
     * @param {object} res
     * @returns {void} return statuc code 204
     */
    delete(req, res) {
        const schedule = Schedule.findOne(req.params.id);
        if (!schedule) {
            return res.status(404).send({'message': 'schedule not found'});
        }
        const ref = Schedule.delete(req.params.id);
        return res.status(204).send(ref);
    },

    /**
     *
     * @param {object} req
     * @param {object} res
     * @returns {void} return statuc code 204
     */

    info(req, res) {
        const schedule = Schedule.info();
        return res.status(200).send(schedule);
    },

    async getData(req, res) {
        const {url, username, password, params} = req.body;
        try {
            const {data} = await Schedule.getData(url, params, username, password);
            return res.status(200).send(data);
        } catch (e) {
            return res.status(e.statusCode).send({message: e.message});
        }
    }
};

export default ScheduleController;
