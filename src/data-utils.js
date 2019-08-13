import _ from "lodash";
import isReachable from "is-reachable";
import rq from "request-promise-native";
import axios from 'axios';

import dotenv from "dotenv";
import {encodeData, groupEntities, nest, searchOrgUnit} from "./utils";
import winston from './winston';
import moment from "moment";

const URL = require('url').URL;

const result = dotenv.config();

if (result.error) {
    throw result.error
}

export const searchTrackedEntities = async (uniqueIds, uniqueAttribute) => {
    let foundEntities = [];
    const all = uniqueIds.map(uniqueId => {
        const params = {
            paging: false,
            ouMode: 'ALL',
            filter: uniqueAttribute + ':IN:' + uniqueId,
            fields: 'trackedEntityInstance'
        };
        return axios.get(getDHIS2Url() + '/trackedEntityInstances', {
            auth: createDHIS2Auth(),
            params
        });
    });

    const results = await Promise.all(all);

    const ids = results.map(({data}) => {
        const {trackedEntityInstances} = data;
        return trackedEntityInstances.map(t => {
            return t.trackedEntityInstance;
        })
    });

    const entities = _.chunk(_.flatten(ids), 50).map(ids => ids.join(';'));

    const all1 = entities.map(entityGroup => {
        const params = {
            paging: false,
            ouMode: 'ALL',
            trackedEntityInstance: entityGroup,
            fields: 'trackedEntityInstance,orgUnit,attributes[attribute,value],enrollments[enrollment,program,' +
                'trackedEntityInstance,trackedEntityType,trackedEntity,enrollmentDate,incidentDate,orgUnit,events[program,trackedEntityInstance,event,' +
                'eventDate,status,completedDate,coordinate,programStage,orgUnit,dataValues[dataElement,value]]]'
        };
        return axios.get(getDHIS2Url() + '/trackedEntityInstances', {
            auth: createDHIS2Auth(),
            params
        });
    });

    const results1 = await Promise.all(all1);

    for (let {data} of results1) {
        const {trackedEntityInstances} = data;
        foundEntities = [...foundEntities, ...trackedEntityInstances];
    }

    return foundEntities
};


export const getUniqueIds = (data, uniqueColumn) => {
    if (uniqueColumn !== null && data && data.length > 0) {
        let foundIds = data.map(d => {
            return d[uniqueColumn];
        }).filter(c => {
            return c !== null && c !== undefined;
        });
        foundIds = _.uniq(foundIds);
        return _.chunk(foundIds, 50).map(ids => ids.join(';'));
    }
    return [];
};

export const makeUrl = (uri, username, password) => {
    if (username !== '' && password !== '') {
        try {
            const url = new URL(uri);
            url.username = username;
            url.password = password;
            return url.href;
        } catch (e) {
            console.log(e);
        }
    }
    return uri;
};

export const getDHIS2Url1 = (uri) => {
    if (uri !== '') {
        try {
            const url = new URL(uri);
            const dataURL = url.pathname.split('/');
            const apiIndex = dataURL.indexOf('api');

            if (apiIndex !== -1) {
                return url.href
            } else {
                if (dataURL[dataURL.length - 1] === "") {
                    return url.href + 'api';
                } else {
                    return url.href + '/api';
                }
            }
        } catch (e) {
            console.log(e);
            return e;
        }
    }

    return null
};

export const createDHIS2Auth = () => {
    const username = process.env.DHIS2_USER;
    const password = process.env.DHIS2_PASS;

    return {username, password}
};

export const getDHIS2Url = () => {
    const uri = process.env.DHIS2_URL;
    return getDHIS2Url1(uri);

};

export const postData = (url, data) => {
    const options = {
        method: 'POST',
        uri: url,
        body: data,
        json: true
    };

    return rq(options);
};


export const postAxios = async (url, query) => {
    return axios.post(url, query, {
        auth: createDHIS2Auth()
    });

};

export const updateData = (url, data) => {
    const options = {
        method: 'PUT',
        uri: url,
        body: data,
        json: true
    };

    return rq(options);
};

export const putAxios = async (url, query) => {
    return axios.put(url, query, {
        auth: createDHIS2Auth()
    });
};


export const getUpstreamData = async (url, params, login) => {
    return  axios.get(url, {
        params,
        auth: login
    })
};

export const getData = async (mapping, params) => {
    try {
        const auth = {};
        if (mapping.username && mapping.password) {
            auth.username = mapping.username;
            auth.password = mapping.password;
        }
        const reachable = await isReachable(mapping.url, {
            timeout: 15000
        });
        if (reachable) {
            return await axios.get(mapping.url, {
                params,
                auth
            });
        } else {
            winston.log('error', 'Url specified in the mapping not reachable');
        }
    } catch (e) {
        winston.log('error', e.message);
    }
};

export const searchedInstances = (uniqueAttribute, trackedEntityInstances) => {
    return groupEntities(uniqueAttribute, trackedEntityInstances)
};

export const updateDHISEvents = (eventsUpdate) => {
    const events = eventsUpdate.map(event => {
        return event.dataValues.map(dataValue => {
            return {event: {...event, dataValues: [dataValue]}, dataElement: dataValue.dataElement};
        });
    });
    return _.flatten(events).map(ev => {
        const eventUrl = getDHIS2Url() + '/events/' + ev.event.event + '/' + ev.dataElement;
        return putAxios(eventUrl, ev.event)
    })
};

export const createProgram = async (processed) => {
    const {
        newTrackedEntityInstances,
        newEnrollments,
        newEvents,
        trackedEntityInstancesUpdate,
        eventsUpdate
    } = processed;

    const trackedEntityUrl = getDHIS2Url() + '/trackedEntityInstances';
    const eventUrl = getDHIS2Url() + '/events';
    const enrollmentUrl = getDHIS2Url() + '/enrollments';

    try {
        if (newTrackedEntityInstances && newTrackedEntityInstances.length > 0) {
            const chunkedTEI = _.chunk(newTrackedEntityInstances, 250);

            for (const tei of chunkedTEI) {
                const {data} = await postAxios(trackedEntityUrl, {
                    trackedEntityInstances: tei
                });
                processResponse(data, 'trackedEntityInstance');
            }
        }
    } catch (e) {
        winston.log('error', e.message);
    }

    try {
        if (trackedEntityInstancesUpdate && trackedEntityInstancesUpdate.length > 0) {
            const chunkedTEI = _.chunk(trackedEntityInstancesUpdate, 250);
            for (const tei of chunkedTEI) {
                const {data} = await postAxios(trackedEntityUrl, {
                    trackedEntityInstances: tei
                });
                processResponse(data, 'trackedEntityInstance');
            }
        }
    } catch (e) {
        winston.log('error', e.message);
    }

    try {
        if (newEnrollments && newEnrollments.length > 0) {
            const chunkedEnrollments = _.chunk(newEnrollments, 250);
            for (const enrollments of chunkedEnrollments) {
                const {data} = await postAxios(enrollmentUrl, {
                    enrollments
                });
                processResponse(data, 'enrollment');
            }
        }
    } catch (e) {
        winston.log('error', e.message);
    }
    try {
        if (newEvents && newEvents.length > 0) {
            const chunkedEvents = _.chunk(newEvents, 250);

            for (const events of chunkedEvents) {
                const {data} = await postAxios(eventUrl, {
                    events
                });
                processResponse(data, 'events');

            }
        }
    } catch (e) {
        winston.log('error', e.message);
    }

    try {
        if (eventsUpdate && eventsUpdate.length > 0) {
            const chunkedEvents = _.chunk(eventsUpdate, 250);

            for (const events of chunkedEvents) {
                const {data} = await Promise.all(updateDHISEvents(events));
                winston.log('info', JSON.stringify(data));
            }
        }
    } catch (e) {
        winston.log('error', e.message);
    }
};

export const pullOrganisationUnits = async (mapping) => {

    try {
        const baseUrl = getDHIS2Url();
        if (baseUrl) {
            const url = baseUrl + '/organisationUnits.json';
            const {data} = await axios.get(url, {
                auth: createDHIS2Auth(),
                params: {
                    level: mapping.currentLevel.value,
                    fields: 'id,name,code',
                    paging: false
                }
            });
            if (data) {
                return data.organisationUnits;
            }
        }
    } catch (e) {
        winston.log('error', e.message);
    }

    return [];
};

export const replaceParam = (params, p) => {

    const foundParam = _.findIndex(params, {
        param: p.param
    });


    if (foundParam !== -1) {
        params.splice(foundParam, 1, p);
    } else {
        params = [...params, p]
    }
};

export const replaceParamByValue = (params, p, search) => {

    const foundParam = _.findIndex(params, v => {
        return typeof v.value === 'string' && v.value.indexOf(search) !== -1
    });

    if (foundParam !== -1) {
        params.splice(foundParam, 1, p);
    } else {
        params = [...params, p]
    }
};


export const makeData = (data, dataSet) => {
    if (data) {
        if ((dataSet.templateType.value + '' === '4' || dataSet.templateType.value + '' === '6') && dataSet.dataElementColumn) {
            return nest(data, [dataSet.dataElementColumn.value]);
        } else if (dataSet.templateType.value === '5') {
            return data;
        }
    }
    return [];
};


export const pullData = (mapping) => {
    let param = '';
    if (mapping.params.length > 0) {
        param = encodeData(mapping.params);
    }
    if (mapping.url !== '') {
        let auth = {};
        try {
            let url = '';
            if (mapping.isDhis2) {
                const uri = getDHIS2Url1(mapping.url);
                url = uri + '/dataValueSets.json';
                auth = createDHIS2Auth();
            } else if (mapping.templateType.value === '5') {
                const uri = getDHIS2Url1(mapping.url);
                url = uri + '/analytics.json'
                auth = createDHIS2Auth();
            } else {
                url = mapping.url;
                if (mapping.username && mapping.password) {
                    auth = {username: mapping.username, password: mapping.password}
                }
            }
            return axios.get(param !== '' ? url + '?' + param : url, {
                auth
            });

        } catch (e) {
            winston.log('error', e.message);
        }
    }
};


export const processDataSetResponses = (response) => {
    if (response['status'] === 'SUCCESS' || response['status'] === 'WARNING') {
        const {imported, deleted, updated, ignored} = response['importCount'];
        winston.log('info', ' imported: ' + imported + ', updated: ' + updated + ', deleted: ' + deleted);
        if (response['conflicts']) {
            response['conflicts'].forEach(c => {
                winston.log('warn', 'conflict found, object: ' + c.object + ', message: ' + c.value);
            });
        }
    } else if (response['httpStatusCode'] === 500) {
        winston.log('error', JSON.stringify(response, null, 2));
    }
};

export const processResponse = (response, type) => {
    if (response) {
        if (response['httpStatusCode'] === 200) {
            const {importSummaries} = response['response'];
            importSummaries.forEach(importSummary => {
                const {importCount, reference} = importSummary;
                winston.log('info', type + ' with id, ' + reference + ' imported: ' + importCount.imported + ', updated: ' + importCount.updated + ', deleted: ' + importCount.deleted);
            });
        } else if (response['httpStatusCode'] === 409) {
            _.forEach(response['response']['importSummaries'], (s) => {
                _.forEach(s['conflicts'], (conflict) => {
                    winston.log('warn', type + ' conflict found, object: ' + conflict.object + ', message: ' + conflict.value);
                });
            });
        } else if (response['httpStatusCode'] === 500) {
            winston.log('error', JSON.stringify(response, null, 2));
        }
    }

};

export const processEventUpdate = (successes) => {
    successes.forEach(s => {
        processDataSetResponses(s, 'event');
    })
};


export const findEventsByDates = async (program, uploadedData) => {
    const {orgUnitColumn, id, organisationUnits, orgUnitStrategy, programStages} = program;
    const {eventDateColumn, eventDateIdentifiesEvent} = programStages[0];
    if (orgUnitColumn && uploadedData && id && eventDateColumn && eventDateIdentifiesEvent) {
        let eventDates = uploadedData.map(d => {
            const ou = searchOrgUnit(d[orgUnitColumn.value], orgUnitStrategy, organisationUnits);
            return {
                eventDate: moment(d[eventDateColumn.value]).format('YYYY-MM-DD'),
                orgUnit: ou ? ou.id : undefined
            };
        }).filter(e => {
            return e.orgUnit && e.eventDate
        });

        eventDates = _.uniq(eventDates);
        try {
            const all = eventDates.map(e => {

                const params = {
                    program: id,
                    startDate: e.eventDate,
                    endDate: e.eventDate,
                    pageSize: 1,
                    orgUnit: e.orgUnit,
                    fields: 'event,eventDate,program,programStage,orgUnit,dataValues[dataElement,value]'
                };
                return axios.get(getDHIS2Url() + '/events.json', {
                    params,
                    auth: createDHIS2Auth()
                });
            });
            const {data} = await Promise.all(all);
            const processed = data.filter(response => {
                return response.events.length > 0;
            }).map(response => {
                const event = response.events[0];
                return [moment(event.eventDate).format('YYYY-MM-DD'), event]
            });

            return _.fromPairs(processed);
        } catch (e) {
            winston.log('error', e.message);
            return {};
        }
    }
};

export const elementsWhichAreIdentifies = (programStageDataElements) => {
    return programStageDataElements.filter(psde => {
        return psde.dataElement.identifiesEvent;
    });
};


export const findEventsByElements = async (program, uploadedData) => {
    const {d2, id, orgUnitColumn, organisationUnits, orgUnitStrategy, programStages} = program;
    const {programStageDataElements} = programStages[0];
    const ele = elementsWhichAreIdentifies(programStageDataElements);
    if (d2 && uploadedData && id && ele.length > 0) {
        const elements = ele.map(e => {
            return e.dataElement.id;
        });


        let values = uploadedData.map(d => {
            return ele.map(e => {
                const ou = searchOrgUnit(d[orgUnitColumn.value], orgUnitStrategy, organisationUnits);
                return {value: d[e.column.value], de: e.dataElement.id, orgUnit: ou ? ou.id : null};
            });
        }).filter(f => _.every(f, v => {
            return v.value !== null && v.value !== undefined && v.value !== '' && v.orgUnit
        }));

        values = _.uniqBy(values, v => {
            return JSON.stringify(v);
        });

        try {
            const all = values.map((e, i) => {
                const filter = e.map(v => {
                    return `filter=${v.de}:EQ:${v.value}`
                }).join('&');
                return axios.get(`${getDHIS2Url()}/events.json?program=${id}&orgUnit=${e[0].orgUnit}&pageSize=1&fields=event,eventDate,program,programStage,orgUnit,dataValues[dataElement,value]&${filter}`, {
                    params,
                    auth: createDHIS2Auth()
                })
            });
            const data = await Promise.all(all);
            const processed = data.filter(response => {
                return response.events && response.events.length > 0;
            }).map(response => {
                const event = response.events[0];
                const es = event.dataValues.filter(d => {
                    return elements.indexOf(d.dataElement) !== -1 && d.value;
                }).map(s => s.value).join('@');
                return [es, event]
            });

            return _.fromPairs(processed);
        } catch (e) {
            winston.log('error', e.message);
            return {}
        }

    }
};


export const whatToComplete = (processed, dataSet) => {
    const p = processed.dataValues.map(d => {
        return _.pick(d, ['orgUnit', 'period']);
    });

    return _.uniqWith(p, _.isEqual).map(p => {
        return {dataSet: dataSet, organisationUnit: p.orgUnit, period: p.period}
    });
};

export const getPeriodFormat = (periodType) => {
    switch (periodType) {
        case 'Daily':
            return 'YYYYMMDD';
        case 'Weekly':
            return 'YYYY[W]WW';
        case 'Monthly':
            return 'YYYYMM';
        case 'BiMonthly':
            return 'YYYYMM';
        case 'Quarterly':
            return 'YYYY[Q]Q';
        case 'SixMonthly':
        case 'Yearly':
            return 'YYYY';
        case 'FinancialJuly':
            return 'YYYY[July]';
        case 'FinancialApril':
            return 'YYYY[April]';
        case 'FinancialOct':
            return 'YYYY[Oct]';
    }
};

export const getSchedule = (schedule) => {
    switch (schedule) {
        case 'Every5s':
            return '*/5 * * * * *';
        case 'Minutely':
            return '* * * * *';
        case 'Hourly':
            return '0 * * * *';
        case 'Daily':
            return '0 0 * * *';
        case 'Weekly':
            return `0 0 * * ${daysToAdd}`;
        case 'Monthly':
            return `0 0 ${daysToAdd} * *`;
        case 'BiMonthly':
            return `0 0 ${daysToAdd} */2 *`;
        case 'Quarterly':
            return `0 0 ${daysToAdd} */3 *`;
        case 'SixMonthly':
            return `0 0 ${daysToAdd} */6 *`;
        case 'Yearly':
            return `0 0 ${daysToAdd} 1 *`;
        case 'FinancialJuly':
            return `0 0 ${daysToAdd} 7 *`;
        case 'FinancialApril':
            return `0 0 ${daysToAdd} 4 *`;
        case 'FinancialOct':
            return `0 0 ${daysToAdd} 10 *`;
    }
};
