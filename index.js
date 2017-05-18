const fs = require('fs');
const async = require('async');
const request = require('request');
const throttledRequest = require('throttled-request')(request);
const htmlToText = require('html-to-text');

throttledRequest.configure({
  requests: 5,
  milliseconds: 1000
});

const ACCESS_TOKEN = 'ACCESS_TOKEN';
const LOCATION_ID = 'LOCATION_ID';
const STORE_NAME = 'STORENAME';



const url = 'https://connect.squareup.com/v1/' + LOCATION_ID;
const headers = {
  'Authorization': 'Bearer ' + ACCESS_TOKEN,
  'Accept': 'application/json',
  'Content-Type': 'application/json'
}

const local = true;
// const jsonUrl = './shop.json';
const url = 'https://' + STORE_NAME + '.squarespace.com/shop/?format=json';

var shop;
var categories;

async.waterfall(
  [
    downloadShop,
    parseCategories,
    parseItems,
    createItems,
  ],
  function(err, result) {

    console.log(result);
  }
);

function downloadShop(callback) {
  console.log('downloadShop');
  // shop = require(jsonUrl);
  // return callback(null)

  throttledRequest(
    {
      url: url,
      headers: { 'user-agent': 'Mozilla/5.0' },
      json: true,
    },
    function (error, response, body) {
      if (!error && typeof body == 'object') {
        shop = body;
        return callback(null);
      } else {
        console.log('json grab error', error);
      }
    }
  );
}

function parseCategories(callback) {
  console.log('parseCategories');

  var ssCategories = shop.collection.categories;
  var sCategories = {};

  var getCategories = function(callback) {
    console.log('getCategories');
    throttledRequest(
      {
        url: url + '/categories',
        method: 'GET',
        headers: headers,
        json: true,
      },
      function(error, response, body) {
        if (!error) {
          for (var i = 0; i < body.length; i++) {
            sCategories[body[i].name] = body[i].id;
          }
          return callback(null);
        } else {
          console.log('error', error);
        }
      }
    );
  };

  var loopCategories = function(callback) {
    console.log('loopCategories')

    var newCategories = [];
    for (var i = 0; i < ssCategories.length; i++) {
      var ssCategory = ssCategories[i];

      if (!sCategories[ssCategory]) {
        newCategories.push(ssCategory);
      } else {
        // console.log('skipping', ssCategory);
      }
    }

    async.every(
      newCategories,
      createCategory,
      function(error, result) {
        return callback(null, !error);
      }
    );
  };

  var createCategory = function(category, callback) {
    throttledRequest(
      {
        url: url + '/categories',
        method: 'POST',
        headers: headers,
        json: {
          "name": category,
        },
      },
      function(error, response, body) {
        if (!error) {
          callback(null, !error);
        } else {
          console.error('error', error);
        }
      }
    );
  };

  async.waterfall(
    [
      getCategories,
      loopCategories,
    ],
    function(err, result) {
      categories = sCategories;
      return callback(null);
    }
  );
}

function parseItems(callback) {
  console.log('parseItems');
  var ssItems = shop.items;

  var items = [];

  for (var i = 0, l = ssItems.length; i < l; i++) {
    var ssItem = ssItems[i];

    var item = {
      "id": ssItem.id,
      "name": ssItem.title,
      "description": htmlToText.fromString(ssItem.excerpt, {wordwrap: false}),
      "type": "NORMAL",
      "visibility": "PRIVATE",
      "available_online": false,
      "category_id": categories[ssItem.categories[0]],
      "variations": []
    };

    for (var j = 0, ll = ssItem.variants.length; j < ll; j++) {
      var ssVariant = ssItem.variants[j];


      var variant = {
        "name": "Unique",
        "pricing_type": "FIXED_PRICING",
        "price_money": {
          "currency_code": "USD",
          "amount": ssVariant.price
        },
        "sku": ssVariant.sku
      };

      if (ssVariant.optionValues.length) {
        variant.name = ssVariant.optionValues[0].value
      }

      item.variations.push(variant);
    }

    items.push(item);
  }

  callback(null, items);
}

function createItems(items, callback) {
  console.log('createItems');

  var createItem = function(item, ssItem, callback) {
    throttledRequest(
      {
        url: url + '/items',
        method: 'POST',
        headers: headers,
        json: item,
      },
      function(error, response, body) {
        if (!error) {
          return callback(null, body, ssItem);
        } else {
          console.error('error', error);
        }
      }
    );
  }

  var downloadRemoteImage = function(newItem, remoteItem, callback) {
    throttledRequest(
      {
        url: remoteItem.assetUrl + '?format=1000w',
        method: 'GET',
        headers: { 'user-agent': 'Mozilla/5.0' },
        encoding: null,
      },
      function(error, response, body) {

        if (!error) {
          return callback(null, newItem, remoteItem, body);
        } else {
          console.error('No image', error);
        }
      }
    );
  }

  var uploadImage = function(newItem, remoteItem, imageData, callback) {
    throttledRequest(
      {
        url: url + '/items/' + newItem.id + '/image',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + ACCESS_TOKEN,
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
        formData: {
          image_data: {
            value: imageData,
            options: {
              filename: 'MyImage.jpg',
              contentType: 'image/jpeg',
            }
          }
        },
      },
      function(error, response, body) {
        if (!error) {
          console.log('Uploaded image for:', newItem.name);
        } else {
          console.log('error', error);
        }
      }
    );
  }

  for (var i = 0, l = items.length; i < l; i++) {
    var item = items[i];
    var ssItem = shop.items[i];

    async.waterfall(
      [
        function(callback) {
          return createItem(item, ssItem, callback);
        },
        downloadRemoteImage,
        uploadImage,
      ],
      function(error, result) {
        if (error) {
          console.error(error);
        }
      }
    );
  }
}



// // List
// throttledRequest(
//   {
//     url: url + '/items',
//     method: 'GET',
//     headers: headers,
//     json: true,
//   },
//   function(error, response, body) {
//     console.log(body);
//   }
// )


// // DELETE
// throttledRequest(
//   {
//     url: url + '/items',
//     method: 'GET',
//     headers: headers,
//     json: true,
//   },
//   function(error, response, body) {
//     // console.log(body[0]);

//     for (var i = 0; i < body.length; i++) {
//       var item = body[i];

//       throttledRequest(
//         {
//           url: url + '/items/' + item.id,
//           method: 'DELETE',
//           headers: headers,
//           json: true,
//         },
//         function(error, response, body) {
//           console.log(body);
//         }
//       )

//     }
//   }
// )
