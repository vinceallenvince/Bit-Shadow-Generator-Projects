(function() {

 'use strict';
  console.log('Version: ' + process.version);
  var sys = require('sys'),
      fs = require('fs'),
      util = require('util'),
      http = require('http'),
      https = require('https'),
      RestClient = require('node-rest-client').Client,
      OAuth = require('oauth'),
      getFolderName = require('./bit-gen-utils').getFolderName,
      msToSec = require('./bit-gen-utils').msToSec,
      msToMin = require('./bit-gen-utils').msToMin;

  var bossServer = '';

  var restClient = new RestClient();
  restClient.on('error', function(err){ // handling client error events
    console.error('Something went wrong on the client', err);
  });

  var generator;
  var dataFiles = null;
  var currentFrame = 12002;
  var projectStart = null;
  var framesFolder = null;
  var config = null;
  var sendTweet = false;
  var framesBTWTweets = 2; // must be > 1
  var totalFramesRendered = 0;
  var blurItems = true;
  var minBlur = 20;
  var maxBlur = 60;

  function init(gen) {
    generator = gen;
    generator.addMenuItem('TornadoFlat', 'TornadoFlat', true, false);
    generator.onPhotoshopEvent('generatorMenuChanged', menuClicked);
  }

  /**
   * Reads data folder and sets total frames = total files in the folder.
   * @param {Object} e An event object.
   */
  function menuClicked(e) {
    if (e.generatorMenuChanged.name === 'TornadoFlat') {
      projectStart = new Date().getTime();

      // create frames folder
      framesFolder = __dirname + '/frames/' + getFolderName();
      fs.mkdirSync(framesFolder);

      // store credentials in config.json
      var file = __dirname + '/config.json';

      fs.readFile(file, 'utf8', function (err, data) {
        if (err) {
          console.log('Error: ' + err);
          return;
        }
        config = JSON.parse(data);
        readLocalFile();
      });

    }
  }

  /**
   * Reads a json file and passes it to render().
   */
  function readLocalFile() {

    var frameStart = new Date().getTime(),
        file = __dirname + '/data/frame' + currentFrame + '.json';

    fs.readFile(file, 'utf8', function (err, data) {
      if (err) {
        console.log('readLocalFile() Error: ' + err);
        return;
      }
      render(data, frameStart);
    });
  }

  var createDoc = function() {

    var data = "{{data}}";
    var framesFolder = '"{{framesFolder}}"';
    var currentFrame = "{{currentFrame}}";
    var blurItems = "{{blurItems}}";
    var minBlur = "{{minBlur}}";
    var maxBlur = "{{maxBlur}}";

    var world = data.world;
    var items = data.items;

    var constrain = function(val, low, high) {
      return val > high ? high : val < low ? low : val;
    };

    var map = function(value, min1, max1, min2, max2) {
        var unitratio = (value - min1) / (max1 - min1);
        return (unitratio * (max2 - min2)) + min2;
    };

    var mag = function(x, y) {
      return Math.sqrt((x * x) + (y * y));
    };

    var radiansToDegrees = function(radians) {
      return radians * (180/Math.PI);
    };

    var isInside = function(obj, container) {
      if (obj.location.x > -obj.width &&
        obj.location.x < container.width &&
        obj.location.y > -obj.height &&
        obj.location.y < container.height) {
        return true;
      }
      return false;
    };

    var startTypeUnits = app.preferences.typeUnits; // getInitialPrefs
    app.preferences.rulerUnits = Units.PIXELS; // setPrefs
    app.displayDialogs = DialogModes.NO; // setDialogMode

    // setup the initial document
    var docWidth = world.width * world.resolution * 2;
    var docHeight = world.height * world.resolution * 2;
    app.documents.add(docWidth, docHeight, 144, 'docRef', NewDocumentMode.RGB);

    // fill the background
    var solidColor = new SolidColor();
    solidColor.rgb.red = world.color[0];
    solidColor.rgb.green = world.color[1];
    solidColor.rgb.blue = world.color[2];
    app.activeDocument.selection.selectAll();
    app.activeDocument.selection.fill(solidColor);
    app.activeDocument.selection.deselect();

    // gradient
    app.activeDocument.artLayers.add();
    var gradientColor = [253, 198, 137];
    var gradient = new SolidColor();
    gradient.rgb.red = gradientColor[0];
    gradient.rgb.green = gradientColor[1];
    gradient.rgb.blue = gradientColor[2];
    var gradSize = world.height * world.resolution;
    var selGrad = Array( // center
      Array(docWidth / 2 - gradSize / 2, docHeight / 2 - gradSize / 2),
      Array(docWidth / 2 + gradSize / 2, docHeight / 2 - gradSize / 2),
      Array(docWidth / 2 + gradSize / 2, docHeight / 2 + gradSize / 2),
      Array(docWidth / 2 - gradSize / 2, docHeight / 2 + gradSize / 2)
    );
    app.activeDocument.selection.select(selGrad, null, gradSize / 2);
    app.activeDocument.selection.fill(gradient, null, 34);
    app.activeDocument.selection.deselect();
    app.activeDocument.activeLayer.applyAddNoise(constrain(12, 1, 400), NoiseDistribution.GAUSSIAN, true);

    // loop thru items
    for (var i = 0, max = items.length; i < max; i++) {

      var item = items[i];
      // Constrain selection to 1 x 1. Smaller values throw an error.
      var itemWidth = constrain(item.scale * world.resolution * 4, 1, docWidth);
      var itemHeight = constrain(item.scale * world.resolution * 4, 1, docHeight);
      var x = (item.location.x * world.resolution * 2) - itemWidth / 2;
      var y = (item.location.y * world.resolution * 2) - itemHeight / 2;
      var pos = {
        location: {
          x: x,
          y: y
        },
        width: itemWidth,
        height: itemHeight
      };
      var container = {
       location: {
          x: docWidth / 2,
          y: docHeight / 2
        },
        width: docWidth,
        height: docHeight
      };
      if (!isInside(pos, container)) {
        continue;
      }

      app.activeDocument.artLayers.add();

      // item
      var color = item.color;
      var selRegion = Array( // centers selection before fill
        Array(docWidth / 2 - itemWidth / 2, docHeight / 2 - itemHeight / 2),
        Array(docWidth / 2 + itemWidth / 2, docHeight / 2 - itemHeight / 2),
        Array(docWidth / 2 + itemWidth / 2, docHeight / 2 + itemHeight / 2),
        Array(docWidth / 2 - itemWidth / 2, docHeight / 2 + itemHeight / 2)
      );
      // for a hard left edge, orient selection to the top left corner, fill, then translate
      app.activeDocument.selection.select(selRegion, null, null);
      if (world.colorMode === 'hsla') {
        app.foregroundColor.hsb.hue = constrain(item.hue, 0, 359);
        app.foregroundColor.hsb.saturation = constrain(100 - (item.lightness * 100), 0, 100);
        app.foregroundColor.hsb.brightness = constrain(item.lightness * 100, 0, 100);
      } else {
        app.foregroundColor.rgb.red = constrain(item.color[0], 0, 255);
        app.foregroundColor.rgb.green = constrain(item.color[1], 0, 255);
        app.foregroundColor.rgb.blue = constrain(item.color[2], 0, 255);
      }
      app.activeDocument.selection.fill(app.foregroundColor);
      //app.activeDocument.selection.translate(docWidth / 2, docHeight / 2);
      app.activeDocument.selection.rotate(item.angle, AnchorPosition.MIDDLECENTER);
      app.activeDocument.selection.deselect();
      app.activeDocument.activeLayer.opacity = constrain(item.opacity * 100, 0, 100);
      if (blurItems) {
        var blurAngle = constrain(item.angle, -360, 360);
        var blurDistance = constrain(map(mag(item.velocity.x, item.velocity.y), 0, item.maxSpeed, minBlur, maxBlur), 1, 2000);
        app.activeDocument.activeLayer.applyMotionBlur(blurAngle, blurDistance);
      }
      //app.activeDocument.activeLayer.translate(x - (docWidth / 2), y - (docHeight / 2));
      app.activeDocument.activeLayer.translate(x - (docWidth / 2 - itemWidth / 2), y - (docHeight / 2 - itemHeight / 2));
    }

    var saveFile = new File(framesFolder + '/' + currentFrame + '.jpg');
    var saveOptions = new JPEGSaveOptions();
    saveOptions.embedColorProfile = false;
    saveOptions.formatOptions = FormatOptions.STANDARDBASELINE;
    saveOptions.matte = MatteType.NONE;
    saveOptions.quality = 10;
    app.activeDocument.saveAs(saveFile, saveOptions, true, Extension.LOWERCASE);
    app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);

    // restorePrefs
    app.preferences.rulerUnits = startTypeUnits;
  };

  function render(data, frameStart) {

    var str = createDoc.toString().
        replace('function () {', '').
        replace('"{{data}}"', data).
        replace('"{{framesFolder}}"', framesFolder).
        replace('"{{currentFrame}}"', currentFrame).
        replace('"{{blurItems}}"', blurItems).
        replace('"{{minBlur}}"', minBlur).
        replace('"{{maxBlur}}"', maxBlur);

    generator.evaluateJSXString(str.slice(0, str.length - 3)).done(
        function (document) {

          var frameDuration = new Date().getTime() - frameStart;
          var dur = frameDuration < 60000 ? msToSec(frameDuration) + ' seconds' : msToMin(frameDuration) + ' minutes';
          console.log('Rendered frame ' + currentFrame + ' in ' + dur + '.');

          totalFramesRendered++;
          currentFrame++;
          readLocalFile();

          // check to send Tweet
          if (sendTweet && !(totalFramesRendered % framesBTWTweets)) {
            createTweetStatus(frameDuration, createTweet, function() {
              // errback
              readLocalFile();
            });
          }
        },
        function (err) {
            console.error('err: ', err);
        });
  }

  /**
   * Queries Wordnik for random words and concatenates a phrase. If the query is successful,
   * calls createTweet to post the status to Twitter.
   *
   * @param {number} frameDuration The time in seconds it took to render the frame.
   */
  function createTweetStatus(frameDuration, callback, errback) {

    var getNounsURL = "http://api.wordnik.com/v4/words.json/randomWords?" +
      "minCorpusCount=1000" +
      "&minDictionaryCount=10" +
      "&excludePartOfSpeech=noun,verb,adverb,interjection,pronoun,preposition,abbreviation,affix,article,auxiliary-verb,conjunction,definite-article,family-name,given-name,idiom,imperative,noun-plural,past-participle,proper-noun,proper-noun-plural,suffix,verb-intransitive,verb-transitive" + // noun-possessive, phrasal-prefix
      "&includePartOfSpeech=adjective" +
      "&hasDictionaryDef=true" +
      "&limit=5" +
      "&maxLength=12" +
      "&api_key=" + config.wordnik_api_key;

    restClient.get(getNounsURL, function(data, response) {

      var results = JSON.parse(data), // parsed response body as js object
          subject = results[0].word,
          modifier = results[1].word,
          dur = frameDuration < 60000 ? msToSec(frameDuration) + ' seconds' : msToMin(frameDuration) + ' minutes',
          status = 'The ' + subject + ' is ' + modifier + '! Rendered frame ' + currentFrame + ' in ' + dur + ' secs.';

      createTweet.call(null, status);

    }).on('error',function(err){
      console.log('Error: something went wrong on the wordnik request', err.request.options);
      errback();
    });
  }

  function createTweet(status) {

    var fileName = framesFolder + '/' + (currentFrame - 1) + '.jpg';

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
      console.log('Error: Something is wrong.\n' + JSON.stringify(err) + '\n');
      readLocalFile();
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

  exports.init = init;

}());
