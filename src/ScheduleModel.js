import moment from "moment";
import { scheduleJob } from "node-schedule";
import parser from "cron-parser";
import _ from "lodash";
import DataStore from "nedb-promises";
import {
  findEvents,
  getData,
  getDHIS2Url,
  getFrequency,
  getPeriodFormat,
  getSchedule,
  getUniqueIds,
  getUpstreamData,
  postAxios,
  postAxios1,
  processDataSetResponses,
  pullData,
  pullOrganisationUnits,
  pullTrackedEntities,
  replaceParam,
  replaceParamByValue,
  searchedInstances,
  searchTrackedEntities,
  whatToComplete,
  withoutDuplicates,
  createProgram,
} from "./data-utils";
import {
  isTracker,
  processDataSet,
  processEvents,
  processProgramData,
  programUniqueAttribute,
  programUniqueColumn,
} from "./utils";
import winston from "./winston";
// import crypto from 'crypto';

// const ALGORITHM = 'aes-256-cbc';
// const password = 'Password used to generate key';
// const salt = 'salt';
// const BLOCK_SIZE = 16;
// const KEY_SIZE = 32;
// const key = crypto.scryptSync(password, salt, KEY_SIZE);

const dbFactory = (fileName) =>
  DataStore.create({
    // filename: `${isDev ? '.' : app.getAppPath('userData')}/data/${fileName}`,
    filename: `./${fileName}`,
    timestampData: true,
    autoload: true,
  });

let schedules = [];

const db = {
  schedules: dbFactory("schedules.db"),
};

class Schedule {
  schedules = [];
  data = {};

  /**
   * class constructor
   * @param {object} data
   */

  constructor() {
    this.loadPreviousSchedules();
  }

  loadPreviousSchedules = async () => {
    const s = await db.schedules.find({});
    this.schedules = s.map((schedule) => {
      return this.create(schedule);
    });
  };

  /**
   *
   * @returns {object} reflection object
   */

  async create(data) {
    const daysToAdd =
      data.additionalDays === 0 && data.schedule !== "Weekly"
        ? 1
        : data.additionalDays;
    let schedule = getSchedule(data.schedule, daysToAdd);
    let format = getPeriodFormat(data.schedule);
    const interval1 = parser.parseExpression(schedule);
    const name = data.name;

    await this.delete(name);
    const job = scheduleJob(data.name, schedule, async () => {
      const mapping = data.value;
      const interval = parser.parseExpression(schedule);
      if (mapping) {
        if (data.type === "tracker") {
          try {
            const program = mapping.value;
            const params = program.params;

            const startParam = params.find(
              (p) => p.isPeriod && p.periodType === "1"
            );
            const endParam = params.find(
              (p) => p.isPeriod && p.periodType === "2"
            );

            let currentParam =
              _.fromPairs(
                params
                  .filter((p) => !p.isPeriod)
                  .map((param) => {
                    return [param.param, param.value];
                  })
              ) || {};

            const current = this.data[name];

            if (current && startParam && endParam) {
              const start = current.last;
              const end = moment().format("YYYY-MM-DD HH:mm:ss");

              currentParam = {
                ...currentParam,
                [startParam.param]: start,
                [endParam.param]: end,
              };
            } else if (
              startParam &&
              endParam &&
              !_.isEmpty(startParam.value) &&
              !_.isEmpty(endParam.value)
            ) {
              const start = moment(startParam.value).format(
                "YYYY-MM-DD HH:mm:ss"
              );
              const end = moment(endParam.value).format("YYYY-MM-DD HH:mm:ss");

              currentParam = {
                ...currentParam,
                [startParam.param]: start,
                [endParam.param]: end,
              };
            } else if (startParam && !_.isEmpty(startParam.value)) {
              const start = moment(startParam.value).format(
                "YYYY-MM-DD HH:mm:ss"
              );
              currentParam = { ...currentParam, [startParam.param]: start };
            } else if (endParam && !_.isEmpty(endParam.value)) {
              const end = moment(endParam.value).format("YYYY-MM-DD HH:mm:ss");
              currentParam = { ...currentParam, [endParam.param]: end };
            }
            let { data } = await getData(program, currentParam);
            const tracker = isTracker(program);
            let processed;
            if (tracker) {
              const uniqueColumn = programUniqueColumn(program);
              const uniqueIds = getUniqueIds(data, uniqueColumn);
              const uniqueAttribute = programUniqueAttribute(program);
              const instances = await searchTrackedEntities(
                program.id,
                uniqueIds,
                uniqueAttribute
              );
              const trackedEntityInstances = searchedInstances(
                uniqueAttribute,
                instances
              );
              processed = processProgramData(
                data,
                program,
                uniqueColumn,
                trackedEntityInstances
              );
            } else {
              data = withoutDuplicates(program, data);
              const previous = await findEvents(program, data);
              processed = processEvents(program, data, previous);
            }
            await createProgram(processed);
          } catch (e) {
            winston.log("error", e.message);
          }
        } else if (data.type === "aggregate") {
          const dataSet = mapping.value;
          const templateType = dataSet.templateType.value + "";
          const currentDate = moment().subtract(daysToAdd, "days");
          if (!format) {
            format = getPeriodFormat(dataSet.periodType);
          }
          const period = currentDate.format(format);

          if (templateType === "4") {
            const periodParam = { param: "period", value: period };
            const orgUnits = await pullOrganisationUnits(dataSet);
            const param = { param: "orgUnit" };
            if (dataSet.multiplePeriods) {
              winston.log("info", "Multiple periods not supported");
            } else {
              const all = orgUnits.map((ou) => {
                param.value = ou.id;
                replaceParam(dataSet.params, param);
                replaceParam(dataSet.params, periodParam);
                return pullData(dataSet);
              });
              const results = await Promise.all(all);
              for (const result of results) {
                const {
                  data: { dataValues },
                } = result;
                try {
                  const processed = processDataSet(dataValues, dataSet);
                  const completeDataSetRegistrations = whatToComplete(
                    processed,
                    mapping.id
                  );
                  const url = getDHIS2Url();
                  const response = await postAxios(url + "/dataValueSets", {
                    dataValues: processed.dataValues,
                  });
                  processDataSetResponses(response.data);
                  await postAxios(url + "/completeDataSetRegistrations", {
                    completeDataSetRegistrations,
                  });
                } catch (e) {
                  winston.log("error", e.message);
                }
              }
            }
          } else if (templateType === "5") {
            const periodParam = { param: "dimension", value: `pe:${period}` };
            try {
              replaceParamByValue(dataSet.params, periodParam, "pe:");
              const { data } = await pullData(dataSet);
              const headers = data.headers.map((h) => h["name"]);
              const found = data.rows.map((r) => {
                return Object.assign.apply(
                  {},
                  headers.map((v, i) => ({
                    [v]: r[i],
                  }))
                );
              });
              const processed = processDataSet(found, dataSet);
              const completeDataSetRegistrations = whatToComplete(
                processed,
                mapping.id
              );
              const url = getDHIS2Url();
              const response = await postAxios(url + "/dataValueSets", {
                dataValues: processed.dataValues,
              });
              processDataSetResponses(response.data);
              await postAxios(url + "/completeDataSetRegistrations", {
                completeDataSetRegistrations,
              });
            } catch (e) {
              winston.log("error", e.message);
            }
          } else if (templateType === "6") {
            winston.log("info", "We are here");
            console.log("We are here");
          }
        } else if (data.type === "attributes") {
          const program = data.value.value;
          const frequency = getFrequency(data.schedule);
          const entities = await pullTrackedEntities(program, frequency);
          const upstream = data.upstream;

          const all = entities.map(({ attributes, enrollments }) => {
            let data = _.fromPairs(
              attributes.map(({ attribute, value }) => {
                return [attribute, value];
              })
            );

            const enrollment = enrollments.find((e) => e.program === program);

            if (enrollment) {
              const { events, ...others } = enrollment;
              data = { ...data, ...others };
            }

            let units = "Years";
            let years = moment().diff(data.g4LJbkM0R24, "years");

            if (years < 1) {
              years = moment().diff(data.g4LJbkM0R24, "months");
              units = "Months";

              if (years < 1) {
                years = moment().diff(data.g4LJbkM0R24, "weeks");
                units = "Weeks";

                if (years < 1) {
                  years = moment().diff(data.g4LJbkM0R24, "days");
                  units = "Days";
                }
              }
            }

            const result = {
              case_id: data.PVXhTjVdB92,
              sample_id: "",
              age: Number(years).toFixed(0),
              sex: data.FZzQbW8AWVd,
              age_units: units,
              name: data.sB1IHYu2xQT,
              nationality: data.XvETY1aTxuB,
              sample_type: data.SI7jnNQpEQM,
              temperature: data.QhDKRe2QDA7,
              telephone_number: data.E7u9XdW24SP,
              vehicle_number: data.h6aZFN4DLcR,
              date_of_entry: data.UJiu0P8GvHt,
              truckDestination: data.pxcXhmjJeMv,
              pointOfEntry: data.orgUnitName,
              passportNo: data.oUqWGeHjj5C,
              sampleCollected: data.NuRldDwq0AJ,
              request_date: data.enrollmentDate,
              dob: data.g4LJbkM0R24,
            };
            winston.log("info", "successfully sent");
            return postAxios1(upstream, result);
          });

          try {
            await Promise.all(all);
          } catch (e) {
            winston.log("error", e.message);
          }
        }
      }
      this.data = {
        ...this.data,
        [data.name]: {
          ...this.data.name,
          next: interval.next().toString(),
          last: moment().format("YYYY-MM-DD HH:mm:ss"),
        },
      };
    });

    job.type = data.type;
    job.createdDate = moment.now();
    job.next = interval1.next().toString();
    job.last = "";
    this.schedules = [...this.schedules, job];
    const searched = await db.schedules.findOne({ name }).exec();
    if (!searched) {
      await db.schedules.insert(data);
    }
    return job;
  }

  /**
   *
   * @param {object} schedule
   * @returns {object} schedule object
   */
  findOne(schedule) {
    return this.schedules.find((s) => s.name === schedule);
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
      schedule = { ...schedule, ...data };
      schedule.modifiedDate = moment.now();
      this.schedules.splice(index, 1, schedule);
      return schedule;
    }

    return {};
  }

  stop(schedule) {
    if (s) {
      let s = this.findOne(schedule);
      s.stop();
      s.stopped = true;
      return s;
    }

    return {};
  }

  info() {
    return this.data;
  }

  /**
   *
   * @param {uuid} id
   */
  async delete(id) {
    let schedule = this.findOne(id);
    if (schedule) {
      const index = this.schedules.indexOf(schedule);
      this.schedules.splice(index, 1);
      schedule.cancel();
      await db.schedules.remove({ name: id });
    }
    return {};
  }

  getData(url, params, username, password) {
    return getUpstreamData(url, params, { username, password });
  }
}

export default new Schedule();
