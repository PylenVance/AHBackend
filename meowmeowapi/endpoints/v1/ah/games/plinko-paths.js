module.exports = {
  path: "",
  method: "GET",
  Auth: true,
  run: async (req, res, mongo_client) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;

      const collection = mongo_client
        .db("ArcadeHaven")
        .collection("PlinkoPaths");

      const documents = await collection
        .find()
        .skip(skip)
        .limit(limit)
        .toArray();

      const totalDocuments = await collection.countDocuments();

      return res.status(200).json({
        status: "success",
        data: documents,
        pagination: {
          page,
          limit,
          totalPages: Math.ceil(totalDocuments / limit),
          totalDocuments,
        },
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
