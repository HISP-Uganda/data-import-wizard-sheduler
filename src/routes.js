import ScheduleModel from "./ScheduleModel";
import { syncTrackedEntityInstances } from "./data-utils";

export const routes = (app, io, d2) => {
  app.post("/schedules", async (req, res) => {
    const data = req.body;
    const job = await ScheduleModel.create(data);
    return res.status(201).send(job);
  });

  app.get("/info", (req, res) => {
    return res.status(201).send(ScheduleModel.data);
  });

  app.get("/schedules", async (req, res) => {
    const schedules = ScheduleModel.findAll();
    return res.status(201).send(schedules);
  });

  app.post("/proxy", async (req, res) => {
    const {
      url,
      username,
      password,
      params,
      isDHIS2 = false,
      attributes = false,
      events = false,
    } = req.body;
    try {
      const { data } = await ScheduleModel.getData(
        url,
        params,
        username,
        password
      );

      if (isDHIS2) {
        if (attributes) {
          console.log(data);
        }
      }

      return res.status(200).send(data);
    } catch (e) {
      return res.status(500).send({ message: e.message });
    }
  });

  app.post("/manual", async (req, res) => {
    const { program, upstream, ...others } = req.body;
    try {
      const response = await syncTrackedEntityInstances(
        program,
        upstream,
        others
      );
      return res.status(200).send(response);
    } catch (e) {
      return res.status(500).send({ message: e.message });
    }
  });

  app.post("/stop", (req, res) => {
    return res.status(201).send(ScheduleModel.stop(req.body.id));
  });

  app.get("/schedules/:id", (req, res) => {
    return res.status(201).send(ScheduleModel.findOne(req.params.id));
  });

  app.put("/schedules/:id", (req, res) => {
    return res.status(201).send(ScheduleModel.update(req.params.id));
  });

  app.delete("/schedules/:id", (req, res) => {
    return res.status(201).send(ScheduleModel.delete(req.params.id));
  });
  app.post("/analytics", async (req, res) => {
    const data = await ScheduleModel.getAnalysis(
      req.body.dx,
      req.body.pe,
      req.body.ou,
      req.body.filterByOus,
      req.body.filterByPeriods,
      req.body.otherDimension,
      req.body.otherDimensionDx
    );
    return res.status(200).send(data);
  });

  app.get("/map", async (req, res) => {
    const data = await ScheduleModel.getMap();
    return res.status(200).send(data);
  });

  app.get("/query", async (req, res) => {
    const { path, ...params } = req.query;
    const data = await ScheduleModel.getDHIS2Data(path, params);
    return res.status(200).send(data);
  });

  app.get("/attributes", async (req, res) => {
    const { program } = req.query;
    const data = await ScheduleModel.getAttributes(program);
    return res.status(200).send(data);
  });
};
