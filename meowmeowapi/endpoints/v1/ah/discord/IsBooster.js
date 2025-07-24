const axios = require("axios");

const checkBoosterUrl = "http://127.0.0.1:3003/user/";

module.exports = {
  path: "",
  method: "GET",
  Auth: false,
  run: async (req, res, mongo_client) => {
    return res.status(400).json({ error: "This endpoint is disabled" });

    const { discord_id } = req.query;
    const url = checkBoosterUrl + discord_id;

    console.log(req.query);

    try {
      const response = await axios.get(url);
      if (response.data.booster) {
        res.status(200).send({ isBooster: true });
      } else {
        res.status(200).send({ isBooster: false });
      }
    } catch (error) {
      res.status(500).send({ error: error });
    }
  },
};
