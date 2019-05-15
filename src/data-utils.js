import _ from "lodash";
import isReachable from "is-reachable";
import rq from "request-promise";

import dotenv from "dotenv";
import { encodeData, groupEntities, nest } from "./utils";
import winston from './winston';

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
        return rq({
            url: getDHIS2Url() + '/trackedEntityInstances',
            qs: params,
            json: true
        });
    });

    const results = await Promise.all(all);

    const ids = results.map(r => {
        const { trackedEntityInstances } = r;
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
        return rq({
            url: getDHIS2Url() + '/trackedEntityInstances',
            qs: params,
            json: true
        });
    });

    const results1 = await Promise.all(all1);

    for (let instance of results1) {
        const { trackedEntityInstances } = instance;
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

export const getDHIS2Url1 = (uri, username, password) => {
    if (uri !== '' && username !== '' && password !== '') {
        try {
            const url = new URL(uri);
            url.username = username;
            url.password = password;
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

export const getDHIS2Url = () => {

    const uri = process.env.DHIS2_URL;
    const username = process.env.DHIS2_USER;
    const password = process.env.DHIS2_PASS;

    return getDHIS2Url1(uri, username, password);

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

export const updateData = (url, data) => {
    const options = {
        method: 'PUT',
        uri: url,
        body: data,
        json: true
    };

    return rq(options);
};

export const getUpstreamData = (url, params) => {
    return rq({
        url,
        qs: params,
        json: true
    })
};

export const getData = async (mapping, params) => {
    try {
        const url = makeUrl(mapping.url, mapping.username, mapping.password);
        const reachable = await isReachable(url, {
            timeout: 15000
        });
        if (reachable) {
            return await rq({
                url,
                qs: params,
                json: true
            });
        } else {
            // winston.log('error', 'Url specified in the mapping not reachable');
        }
    } catch (e) {
        // winston.log('error', e.toString());
    }
};

export const searchedInstances = (uniqueAttribute, trackedEntityInstances) => {
    return groupEntities(uniqueAttribute, trackedEntityInstances)
};

export const updateDHISEvents = (eventsUpdate) => {
    const events = eventsUpdate.map(event => {
        return event.dataValues.map(dataValue => {
            return { event: { ...event, dataValues: [dataValue] }, dataElement: dataValue.dataElement };
        });
    });
    return _.flatten(events).map(ev => {
        const eventUrl = getDHIS2Url() + '/events/' + ev.event.event + '/' + ev.dataElement;
        return updateData(eventUrl, ev.event)
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
        if (newTrackedEntityInstances.length > 0) {
            const chunkedTEI = _.chunk(newTrackedEntityInstances, 250);

            for (const tei of chunkedTEI) {
                const instancesResults = await postData(trackedEntityUrl, {
                    trackedEntityInstances: tei
                });
                processResponse(instancesResults, 'trackedEntityInstance');
            }
        }
    } catch (e) {
        console.log(e);
    }

    try {
        if (trackedEntityInstancesUpdate.length > 0) {
            const chunkedTEI = _.chunk(trackedEntityInstancesUpdate, 250);
            for (const tei of chunkedTEI) {
                const instancesResults = await postData(trackedEntityUrl, {
                    trackedEntityInstances: tei
                });
                processResponse(instancesResults, 'trackedEntityInstance');
            }
        }
    } catch (e) {
        console.log(e);
    }

    try {
        if (newEnrollments.length > 0) {
            const chunkedEnrollments = _.chunk(newEnrollments, 250);
            for (const enrollments of chunkedEnrollments) {
                const instancesResults = await postData(enrollmentUrl, {
                    enrollments
                });
                processResponse(instancesResults, 'enrollment');

            }
        }
    } catch (e) {
        console.log(e);
    }
    try {
        if (newEvents.length > 0) {
            const chunkedEvents = _.chunk(newEvents, 250);

            for (const events of chunkedEvents) {
                const instancesResults = await postData(eventUrl, {
                    events
                });
                processResponse(instancesResults, 'events');

            }
        }
    } catch (e) {
        console.log(e);
    }

    try {
        if (eventsUpdate.length > 0) {
            const chunkedEvents = _.chunk(eventsUpdate, 250);

            for (const events of chunkedEvents) {
                const eventsResults = await Promise.all(updateDHISEvents(events));
                winston.log('info', JSON.stringify(eventsResults));
            }
        }
    } catch (e) {
        console.log(e);
    }
};

export const pullOrganisationUnits = async (mapping) => {

    try {
        const baseUrl = getDHIS2Url();
        if (baseUrl) {
            const url = baseUrl + '/organisationUnits.json';
            const data = await getUpstreamData(url, {
                level: mapping.currentLevel.value,
                fields: 'id,name,code',
                paging: false
            });
            if (data) {
                return data.organisationUnits;
            }
        }
    } catch (e) {
        console.log(e);
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
        return p.value.indexOf(search) !== -1 && v.value.indexOf(search) !== -1
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
        try {
            let url = '';
            if (mapping.isDhis2) {
                const uri = getDHIS2Url1(mapping.url, mapping.username, mapping.password);
                url = uri + '/dataValueSets.json';
            } else if (mapping.templateType.value === '5') {
                const uri = getDHIS2Url1(mapping.url, mapping.username, mapping.password);
                url = uri + '/analytics'
            } else {
                url = makeUrl(mapping.url, mapping.username, mapping.password);
            }
            return rq({
                url: url + '?' + param,
                json: true
            });

        } catch (e) {
        }
    }
};

export const getValidationRules = async () => {
    const url = getDHIS2Url() + '/validationRules.json';

    const data = await getUpstreamData(url, { paging: false, fields: '*' });

    return data;
}


export const processDataSetResponses = (response) => {
    if (response['status'] === 'SUCCESS' || response['status'] === 'WARNING') {
        const { imported, deleted, updated, ignored } = response['importCount'];
        winston.log('info', ' imported: ' + imported + ', updated: ' + updated + ', deleted: ' + deleted);
        if (response['conflicts']) {
            response['conflicts'].forEach(c => {
                winston.log('warn', 'conflict found, object: ' + c.object + ', message: ' + c.value);
            });
        }
    } else if (response['httpStatusCode'] === 500) {
        winston.log('error', JSON.stringify(response, null, 2));
    }
}

export const processResponse = (response, type) => {
    if (response) {
        if (response['httpStatusCode'] === 200) {
            const { importSummaries } = response['response'];
            importSummaries.forEach(importSummary => {
                const { importCount, reference } = importSummary;
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
    console.log(successes);
    successes.forEach(s => {
        processDataSetResponses(s,'event');
    })
}
