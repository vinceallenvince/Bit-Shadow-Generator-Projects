(function() {

 'use strict';
  console.log('Version: ' + process.version);
  var sys = require('sys'),
      exec = require('child_process').exec,
      fs = require('fs'),
      util = require('util'),
      http = require('http'),
      https = require('https'),
      restclient = require('node-restclient'),
      OAuth = require('oauth');

  var bossServer = 'http://bit-shadow-boss.jit.su';

  var generator;
  var dataFiles = null;
  var currentFrame = 0;
  var totalFramesRendered = 0;
  var projectStart = null;
  var framesFolder = null;
  var config = null;
  var sendTweet = true;
  var framesBTWTweets = 20;

  function init(gen) {
    generator = gen;
    generator.addMenuItem('Flock001', 'Flock001', true, false);
    generator.onPhotoshopEvent('generatorMenuChanged', menuClicked);
  }

  /**
   * Reads data folder and sets total frames = total files in the folder.
   * @param {Object} e An event object.
   */
  function menuClicked(e) {
    if (e.generatorMenuChanged.name === 'Flock001') {
      projectStart = new Date().getTime();
      framesFolder = __dirname + '/Frames/' + getFolderName();
      fs.mkdirSync(framesFolder);

      // store credentials in config.json
      var file = __dirname + '/config.json';

      fs.readFile(file, 'utf8', function (err, data) {
        if (err) {
          console.log('Error: ' + err);
          return;
        }
        config = JSON.parse(data);
        //readLocalFile();
        readFile();
      });
    }
  }

  /**
   * Reads a json file and passes it to render().
   */
  function readLocalFile() {

    var frameStart = new Date().getTime(),
        file = __dirname + '/data/frame' + currentFrame + '.json',
        frames = [];

    fs.readFile(file, 'utf8', function (err, data) {
      if (err) {
        console.log('Error: ' + err);
        return;
      }
      frames.push(JSON.parse(data));
      render(data, frameStart); // need to stringify everything
    });
  }

  function readFile() {

    var frameStart = new Date().getTime(),
      frames = [];

    http.get(bossServer + "/data", function(res) {

      var data = '';

      res.on('data', function (chunk){
          data += chunk;
      });

      res.on('end', function(){
        var parsedData = JSON.parse(data);

        if (parsedData.stop) {
          return;
        }

        currentFrame = parsedData.frame;
        frames.push(parsedData);
        render(data, frameStart); // need to stringify everything
      })

    }).on('error', function(e) {
      console.log("Got error: " + e.message);
    });
  }


  function render(data, frameStart) {

    var test = JSON.parse(data);
    console.log('rendering frame ' + currentFrame);
    console.log('total items to render: ' + test.items.length);

    var retina = 2;

    var map = "map = function(value, min1, max1, min2, max2) { \
        var unitratio = (value - min1) / (max1 - min1); \
        return (unitratio * (max2 - min2)) + min2; \
    };"

    var constrain = "var constrain = function(val, low, high) { \
      if (val > high) { \
        return high; \
      } else if (val < low) { \
        return low; \
      } \
      return val; \
    };";

    var mag = "var mag = function(x, y) {return Math.sqrt((x * x) + (y * y));};";

    var radiansToDegrees = "var radiansToDegrees = function(radians) {return radians * (180/Math.PI);};";

    var isInside = "var isInside = function(obj, container) { \
        if (obj.location.x > -obj.width && \
          obj.location.x < container.width && \
          obj.location.y > -obj.height && \
          obj.location.y < container.height) { \
          return true; \
        } \
        return false; \
      };";

    var getInitialPrefs = "var startTypeUnits = app.preferences.typeUnits;";

    var setPrefs = "app.preferences.rulerUnits = Units.PIXELS;";

    var restorePrefs = "app.preferences.rulerUnits = startTypeUnits;";

    var setDialogMode = "app.displayDialogs = DialogModes.NO;";

    var frames = "var frame = " + data + ";";

    var createDoc = "var docWidth = frame.world.width * frame.world.resolution * " + retina + "; \
        var docHeight = frame.world.height * frame.world.resolution * " + retina + "; \
        app.documents.add(docWidth, docHeight, 144, 'docRef' + i, NewDocumentMode.RGB);";

    var fillBackground = "var solidColor = new SolidColor(); \
        solidColor.rgb.red = 0; \
        solidColor.rgb.green = 0; \
        solidColor.rgb.blue = 0; \
        app.activeDocument.selection.selectAll(); \
        app.activeDocument.selection.fill(solidColor); \
        app.activeDocument.selection.deselect(); \
        var myLayerSets = []; \
        var layerSetMax = Math.floor(frame.items.length / 64); \
        var layerSetCount = 0; \
        myLayerSets.push(app.activeDocument.layerSets.add()); \
        myLayerSets[myLayerSets.length - 1].name = 'set ' + myLayerSets.length;";

    var openMainLoop = "for(var j = 0; j < frame.items.length; j++) {";

    /*
     * Creates a group at a threshold number of frames. Moves any top-level layers into the group.
     * Adds a filled selection to a new artLayer so Gausssian blue does not try to blur
     * an empty layer. Applies Gaussian blur to entire group.
     */
     // app.activeDocument.activeLayer.applyGaussianBlur(map(j, 0, frame.items.length, 20, 0)); \
    var checkLayerSet = "if (layerSetCount < layerSetMax) { \
      layerSetCount++; \
    } else { \
      myLayerSets[myLayerSets.length - 1].artLayers.add(); \
      var fakeRegion = Array(Array(0, 0), Array(1, 0), Array(1, 1), Array(0, 1)); \
      app.activeDocument.selection.select(selRegion); \
      app.activeDocument.selection.fill(app.foregroundColor); \
      app.activeDocument.activeLayer.opacity = 1; \
      app.activeDocument.selection.deselect(); \
      myLayerSets[myLayerSets.length - 1].merge(); \
      app.activeDocument.activeLayer.applyGaussianBlur(map(j, 0, frame.items.length, 3, 0)); \
      myLayerSets.push(app.activeDocument.layerSets.add()); \
      myLayerSets[myLayerSets.length - 1].name = 'set ' + myLayerSets.length; \
      layerSetCount = 0; \
    }";

    var main = "var item = frame.items[j]; \
        var itemWidth = item.scale * frame.world.resolution * 4; \
        var itemHeight = item.scale * frame.world.resolution * 4; \
        myLayerSets[myLayerSets.length - 1].artLayers.add(); \
        var selRegion = Array(Array(0, 0), Array(itemWidth, 0), Array(itemWidth, itemHeight), Array(0, itemHeight)); \
        app.activeDocument.selection.select(selRegion); \
        var x = (item.location.x * frame.world.resolution * " + retina + ") - itemWidth / 2; \
        var y = (item.location.y * frame.world.resolution * " + retina + ") - itemHeight / 2; \
        var pos = { \
          location: { \
            x: x, \
            y: y \
          }, \
          width: itemWidth, \
          height: itemHeight \
        }; \
        var container = { \
         location: { \
            x: docWidth / 2, \
            y: docHeight / 2 \
          }, \
          width: docWidth, \
          height: docHeight \
        }; \
        if (!isInside(pos, container)) { \
          continue; \
        } \
        if (frame.world.colorMode === 'hsla') { \
          app.foregroundColor.hsb.hue = constrain(item.hue, 0, 359); \
          app.foregroundColor.hsb.saturation = constrain(100 - (item.lightness * 100), 0, 100); \
          app.foregroundColor.hsb.brightness = constrain(item.lightness * 100, 0, 100); \
        } else { \
          app.foregroundColor.rgb.red = constrain(item.color[0], 0, 255); \
          app.foregroundColor.rgb.green = constrain(item.color[1], 0, 255); \
          app.foregroundColor.rgb.blue = constrain(item.color[2], 0, 255); \
        } \
        app.activeDocument.selection.fill(app.foregroundColor); \
        app.activeDocument.selection.translate(docWidth / 2, docHeight / 2); \
        app.activeDocument.selection.rotate(item.angle, AnchorPosition.MIDDLECENTER); \
        app.activeDocument.activeLayer.opacity = constrain(item.opacity * 100, 0, 100); \
        var blurAngle = constrain(item.angle, -360, 360); \
        var blurDistance = constrain(map(mag(item.velocity.x, item.velocity.y), 0, item.maxSpeed, 0, 30), 1, 2000); \
        app.activeDocument.activeLayer.applyMotionBlur(blurAngle, blurDistance); \
        app.activeDocument.selection.translate(x - (docWidth / 2), y - (docHeight / 2)); \
        app.activeDocument.selection.deselect();";

    var closeMainLoop = "}";

    var saveFile = "var saveFile = new File('" + framesFolder + "/" + currentFrame + ".jpg'); \
        var saveOptions = new JPEGSaveOptions(); \
        saveOptions.embedColorProfile = false; \
        saveOptions.formatOptions = FormatOptions.STANDARDBASELINE; \
        saveOptions.matte = MatteType.NONE; \
        saveOptions.quality = 10; \
        app.activeDocument.saveAs(saveFile, saveOptions, true, Extension.LOWERCASE); \
        app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);";

    generator.evaluateJSXString(map +
        constrain +
        mag +
        radiansToDegrees +
        isInside +
        getInitialPrefs +
        setPrefs +
        setDialogMode +
        frames +
        createDoc +
        fillBackground +
        openMainLoop +
        checkLayerSet +
        main +
        closeMainLoop +
        saveFile +
        restorePrefs).done(
        function (document) {

          // uncomment if debugging w local files
          //currentFrame++;
          //readLocalFile();

          var frameDuration = new Date().getTime() - frameStart;
          totalFramesRendered++;
          sendComplete(frameDuration);

          var projectTime = msToSec(new Date().getTime() - projectStart);
          if (sendTweet && !(totalFramesRendered % framesBTWTweets)) {
            createTweetStatus(projectTime);
          }
        },
        function (err) {
            console.error('err: ', err);
        });
  }

  /**
   * Sends the completed frame number to the boss.
   */
  function sendComplete(frameDuration) {

    http.get(bossServer + "/complete/" + currentFrame + "/" + frameDuration, function(res) {

      var data = '';

      res.on('data', function (chunk){
          data += chunk;
      });

      res.on('end',function(){
        console.log(data);
        readFile();
      })

    }).on('error', function(e) {
      console.log("Got error: " + e.message);
      readFile();
    });
  }

  /**
   * Formats a folder name based on the currrent time.
   */
  function getFolderName() {

    var date = new Date(),
        year = date.getFullYear(),
        month = date.getMonth(),
        day = date.getDate(),
        hours = date.getHours(),
        minutes = date.getMinutes(),
        seconds = date.getSeconds();

    return year.toString() +
        (month < 10 ? '0' + month : month).toString() +
        (day < 10 ? '0' + day : day).toString() +
        (hours < 10 ? '0' + hours : hours).toString() +
        (minutes < 10 ? '0' + minutes : minutes).toString() +
        (seconds < 10 ? '0' + seconds : seconds).toString();
  }

  /**
   * Returns seconds based on passed milliseconds.
   * return {number} Seconds.
   */
  function msToSec(ms) {
    return parseFloat(ms / 1000).toFixed(2);
  }

  /**
   * Done!
   */
  /*function renderComplete() {
    var projectTime = msToSec(new Date().getTime() - projectStart);
    if (sendTweet) {
      createTweetStatus(projectTime);
    }
    console.log('*** DONE ***');
    console.log('Total frames: ' + (currentFrame - 1));
    console.log('Time: ' + projectTime + 'sec');

  }*/

  function createTweet(status) {

    var fileName = framesFolder + '/' + currentFrame + '.jpg';

    var data = fs.readFileSync(fileName);

    var oauth = new OAuth.OAuth(
      'https://api.twitter.com/oauth/request_token',
      'https://api.twitter.com/oauth/access_token',
      config.twitter_consumer_key,
      config.twitter_consumer_secret,
      '1.0A',
      null,
      'HMAC-SHA1'
    );

    uploadMedia(oauth, status, fileName);

    // uncomment to just tweet a status without media
    // function(url, oauth_token, oauth_token_secret, post_body, post_content_type, callback)
    /*oauth.post(
      'https://api.twitter.com/1.1/statuses/update.json',
      config.twitter_access_token,
      config.twitter_access_token_secret,
      {status: status},
      'application/json',
      function (err, data, res){
        if (err) {
          console.error(err);
        }
        console.log(util.inspect(data));
      });*/
 }

  /**
   * Manually builds a multipart/form-data request and makes the post.
   *
   * http://stackoverflow.com/questions/12921371/posting-images-to-twitter-in-node-js-using-oauth
   */
  function uploadMedia(oauth, status, fileName) {

    var data = fs.readFileSync(fileName);
    var crlf ='\r\n';
    var boundary = '---------------------------10102754414578508781458777923';

    var separator = '--' + boundary;
    var footer = crlf + separator + '--' + crlf;
    var fileHeader = 'Content-Disposition: file; name="media"; filename="' + fileName + '"';

    var contents = separator + crlf
        + 'Content-Disposition: form-data; name="status"' + crlf
        + crlf
        + status + crlf
        + separator + crlf
        + fileHeader + crlf
        + 'Content-Type: image/jpeg' +  crlf
        + crlf;

    var multipartBody = Buffer.concat([
        new Buffer(contents),
        data,
        new Buffer(footer)]);

    var hostname = 'api.twitter.com';
    var authorization = oauth.authHeader(
        'https://api.twitter.com/1.1/statuses/update_with_media.json',
        config.twitter_access_token, config.twitter_access_token_secret, 'POST');

    var headers = {
        'Authorization': authorization,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Host': hostname,
        'Content-Length': multipartBody.length,
        'Connection': 'Keep-Alive'
    };

    var options = {
        host: hostname,
        port: 443,
        path: '/1.1/statuses/update_with_media.json',
        method: 'POST',
        headers: headers
    };

    var request = https.request(options);
    request.write(multipartBody);
    request.end();

    request.on('error', function (err) {
        console.log('Error: Something is wrong.\n'+JSON.stringify(err)+'\n');
    });

    request.on('response', function (response) {
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            console.log(chunk.toString());
        });
        response.on('end', function () {
            console.log(response.statusCode +'\n');
        });
    });

  }

  /**
   * Queries Wordnik for random words and concatenates a phrase. If the query is successful,
   * calls createTweet to post the status to Twitter.
   *
   * @param {number} projectTime The time in seconds it took to render the project.
   */
  function createTweetStatus(projectTime) {

    var getNounsURL = "http://api.wordnik.com/v4/words.json/randomWords?" +
      "minCorpusCount=1000" +
      "&minDictionaryCount=10" +
      "&excludePartOfSpeech=noun,verb,adverb,interjection,pronoun,preposition,abbreviation,affix,article,auxiliary-verb,conjunction,definite-article,family-name,given-name,idiom,imperative,noun-plural,past-participle,proper-noun,proper-noun-plural,suffix,verb-intransitive,verb-transitive" + // noun-possessive, phrasal-prefix
      "&includePartOfSpeech=adjective" +
      "&hasDictionaryDef=true" +
      "&limit=5" +
      "&maxLength=12" +
      "&api_key=" + config.wordnik_api_key;

    restclient.get(getNounsURL, function(reply) {

      var subject = reply[0].word,
          modifier = reply[1].word;

      var status = 'The ' + subject + ' is ' + modifier + '! Rendered ' + currentFrame + ' frames in ' + projectTime + ' secs.';

      createTweet(status);
    }, 'json');
  }

  /**
   * Generates a psuedo-random number within a range.
   *
   * @function getRandomNumber
   * @memberof System
   * @param {number} low The low end of the range.
   * @param {number} high The high end of the range.
   * @param {boolean} [flt] Set to true to return a float.
   * @returns {number} A number.
   */
  function getRandomNumber(low, high, flt) {
    if (flt) {
      return Math.random()*(high-(low-1)) + low;
    }
    return Math.floor(Math.random()*(high-(low-1))) + low;
  };

  /*
   * update width/height based on scale; ex: var itemWidth = data.width * data.scale; itemHeight = data.height * data.scale;
   * create selection based on width, height; ex: var selRegion = Array(Array(0, 0), Array(itemWidth, 0), Array(itemWidth, itemHeight), Array(0, itemHeight));
   * translate selection based on location.x, location.y; ex: selRegion.translateBoundary(data.location.x * data.world.resolution, data.location.y * data.world.resolution)
   * update app.foregroundColor based on hue, saturation, lightness; ex:
   *   app.foregroundColor.hsb.hue = number [0.0..360.0];
   *   app.foregroundColor.hsb.saturation = number [0.0..100.0];
   *   app.foregroundColor.hsb.brightness = number [0.0..100.0];
   * set layer opacity based on opacity; ex: app.activeDocument.activeLayer.opacity = [0.0..100.0];
   * deselect
   * apply motion blur based on item's angle (direction) and velocity; ex: app.activeDocument.activeLayer.applyMotionBlur(30, 10);
   * motion blur wants a number bw -90 & 90
   * saveFile
   * app.activeDocument.activeLayer.applyGaussianBlur(map(i, 0, frames[i].items.length, 10, 0)); \
   */

  exports.init = init;

}());
