module.exports = {
  path: "",
  method: "GET",
  Auth: false,
  run: async (req, res, mongo_client) => {
    try {
      const collection = mongo_client.db("ArcadeHaven").collection("cases");
      const documents = await collection.find().toArray();
      const cases = documents.reduce((acc, document) => {
        acc[document["Case Name"]] = document;
        return acc;
      }, {});

      res.status(200).json({
        status: "success",
        data: cases,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        status: "error",
        error: "Internal server error",
      });
    }
  },
};
