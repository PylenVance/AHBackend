const { default: axios } = require("axios");

module.exports = async (cid, message_object) => {
  try {
    axios.post("http://127.0.0.1:3003/", {
      msg: message_object,
      channel_id: cid,
    });
  } catch (error) {
    console.log(error);
  }
};
