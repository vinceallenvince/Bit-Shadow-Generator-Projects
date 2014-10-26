var BitGenUtils = {};

/**
 * Formats a folder name based on the currrent time.
 */
BitGenUtils.getFolderName = function(projectName) {

  var prjName = projectName || 'project',
      date = new Date(),
      year = date.getFullYear(),
      month = date.getMonth(),
      day = date.getDate(),
      hours = date.getHours(),
      minutes = date.getMinutes(),
      seconds = date.getSeconds();

  return prjName + '-' +
      year.toString() +
      (month < 10 ? '0' + month : month).toString() +
      (day < 10 ? '0' + day : day).toString() +
      (hours < 10 ? '0' + hours : hours).toString() +
      (minutes < 10 ? '0' + minutes : minutes).toString() +
      (seconds < 10 ? '0' + seconds : seconds).toString();
}

/**
 * Returns seconds based on passed milliseconds.
 * @param {number} ms Milliseconds.
 * return {string} Seconds.
 */
BitGenUtils.msToSec = function(ms) {
  return parseFloat(ms / 1000).toFixed(2);
}

/**
 * Returns minutes based on passed milliseconds.
 * @param {number} ms Milliseconds.
 * return {string} Minutes.
 */
BitGenUtils.msToMin = function(ms) {
  return (parseFloat(ms / 1000) / 60).toFixed(2);
}

exports.getFolderName = BitGenUtils.getFolderName;
exports.msToSec = BitGenUtils.msToSec;
exports.msToMin = BitGenUtils.msToMin;
