import moment from 'moment';
import {scheduleJob} from "node-schedule";
import parser from "cron-parser";

import {
    createProgram,
    getData,
    getDHIS2Url,
    getUniqueIds,
    makeData,
    postData,
    pullData,
    pullOrganisationUnits,
    replaceParam,
    searchedInstances,
    searchTrackedEntities,
    processDataSetResponses,
    processResponse, findEventsByDates, findEventsByElements
} from "./data-utils";
import {
    enumerateDates,
    isTracker,
    processDataSet, processEvents,
    processProgramData,
    programUniqueAttribute,
    programUniqueColumn
} from "./utils";
import winston from './winston';

class Schedule {
    /**
     * class constructor
     * @param {object} data
     */
    constructor() {
        this.schedules = [];
        this.data = {};
    }

    /**
     *
     * @returns {object} reflection object
     */
    create(data) {
        let schedule = '*/5 * * * * *';

        switch (data.schedule) {
            case 'Every5s':
                schedule = '*/5 * * * * *';
                break;
            case 'Minutely':
                schedule = '* * * * *';
                break;
            case 'Hourly':
                schedule = '0 * * * *';
                break;
            case 'Daily':
                schedule = '0 0 * * *';
                break;
            case 'Weekly':
                schedule = '0 0 * * 0';
                break;
            case 'Monthly':
                schedule = '0 0 1 * *';
                break;
            case 'Quarterly':
                schedule = '0 0 1 */3 *';
                break;
            case 'SixMonthly':
                schedule = '0 0 1 */6 *';
                break;
            case 'Yearly':
                schedule = '0 0 1 1 *';

        }

        const interval1 = parser.parseExpression(schedule);

        const job = scheduleJob(data.name, schedule, async () => {
            const mapping = data.value;
            const interval = parser.parseExpression(schedule);
            if (mapping) {
                if (data.type === 'tracker') {
                    try {
                        const program = mapping.value;
                        const data = await getData(program);
                        const tracker = isTracker(program);

                        let processed = {};

                        if (tracker) {
                            const uniqueColumn = programUniqueColumn(program);
                            const uniqueIds = getUniqueIds(data, uniqueColumn);
                            const uniqueAttribute = programUniqueAttribute(program);
                            const instances = await searchTrackedEntities(uniqueIds, uniqueAttribute);
                            const trackedEntityInstances = searchedInstances(uniqueAttribute, instances);
                            processed = processProgramData(data, program, uniqueColumn, trackedEntityInstances);
                        } else {
                            const uniqueDatesData = await findEventsByDates(program, data);
                            const uniqueDataElementData = await findEventsByElements(program, data);
                            processed = processEvents(program, data, uniqueDatesData, uniqueDataElementData)
                        }
                        await createProgram(processed);
                    } catch (e) {
                        winston.log('error', e.message);
                    }
                } else if (data.type === 'aggregate') {
                    const dataSet = mapping.value;
                    const templateType = dataSet.templateType.value + '';
                    if (templateType === '4') {
                        const orgUnits = await pullOrganisationUnits(dataSet);
                        const param = {param: 'orgUnit'};

                        if (dataSet.multiplePeriods) {
                            winston.log('info', 'Multiple periods not supported');
                            /*if (dataSet.startPeriod && dataSet.endPeriod && dataSet.addition && dataSet.additionFormat) {
                                const periods = enumerateDates(dataSet.startPeriod, dataSet.endPeriod, dataSet.addition, dataSet.additionFormat);
                                const pp = {param: 'period'};
                                for (const p of periods) {
                                    pp.value = p;
                                    replaceParam(dataSet.params, pp);
                                    const all = orgUnits.map(ou => {
                                        param.value = ou.id;
                                        replaceParam(dataSet.params, param);
                                        return pullData(dataSet).then(d => {
                                            console.log(d)
                                        });
                                    });

                                    const results = await Promise.all(all);

                                    console.log(results);
                                }

                            } else {
                            }*/
                        } else {
                            const all = orgUnits.map(ou => {
                                param.value = ou.id;
                                replaceParam(dataSet.params, param);
                                return pullData(dataSet);
                            });
                            const results = await Promise.all(all);

                            for (const result of results) {
                                try {
                                    const data = makeData(result.dataValues, dataSet);
                                    const processed = processDataSet(data, dataSet);
                                    const url = getDHIS2Url();
                                    const response = await postData(url + '/dataValueSets', {dataValues: processed});
                                    processDataSetResponses(response);
                                } catch (e) {
                                    winston.log('error', e.message);
                                }
                            }
                        }
                    } else if (templateType === '5') {
                        try {
                            const data = await pullData(dataSet);
                            const headers = data.headers.map(h => h['name']);
                            const found = data.rows.map(r => {
                                return Object.assign.apply({}, headers.map((v, i) => ({
                                    [v]: r[i]
                                })));
                            });

                            const processed = processDataSet(found, dataSet);

                            const url = getDHIS2Url();

                            const response = await postData(url + '/dataValueSets', {dataValues: processed});
                            processDataSetResponses(response)
                        } catch (e) {
                            winston.log('error', e.message);
                        }
                    } else if (templateType === '6') {
                        winston.log('info', 'We are here');
                        console.log('We are here');
                    }
                }
            }

            this.data = {
                ...this.data,
                [data.name]: {...this.data.name, next: interval.next().toString(), last: moment().toString()}
            }
        });

        job.type = data.type;
        job.createdDate = moment.now();
        job.next = interval1.next().toString();
        job.last = '';
        this.schedules = [...this.schedules, job];
        return job
    }

    /**
     *
     * @param {object} schedule
     * @returns {object} schedule object
     */
    findOne(schedule) {
        return this.schedules.find(s => s.name === schedule);
    }

    /**
     * @returns {object} returns all reflections
     */
    findAll() {
        return this.schedules;
    }

    /**
     *
     * @param {uuid} id
     * @param {object} data
     */
    update(id, data) {
        let schedule = this.findOne(id);
        if (schedule) {
            const index = this.schedules.indexOf(schedule);
            schedule = {...schedule, ...data};
            schedule.modifiedDate = moment.now();
            this.schedules.splice(index, 1, schedule);
            return schedule;
        }

        return {};
    }

    stop(schedule) {
        let s = this.findOne(schedule);
        s.stop();
        s.stopped = true;
        console.log('stopped');
        return s;
    }

    info() {
        return this.data;
    }

    /**
     *
     * @param {uuid} id
     */
    delete(id) {
        let schedule = this.findOne(id);
        if (schedule) {
            const index = this.schedules.indexOf(schedule);
            this.schedules.splice(index, 1);
        }
        return {};
    }
}

export default new Schedule();
