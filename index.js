'use strict';

const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Payload} = require('dialogflow-fulfillment');
const MapsClient = require('@googlemaps/google-maps-services-js').Client;
const {BigQuery} = require('@google-cloud/bigquery');

process.env.DEBUG = 'dialogflow:debug';  // enables lib debugging statements

function convertTimeFormat(hours, minutes) {
  var AmOrPm = hours >= 12 ? 'pm' : 'am';
  hours = (hours % 12) || 12;
  return hours + ':' + minutes + ' ' + AmOrPm;
}


function queryCovid19dataset(tableName, country) {
  if (!['confirmed_cases', 'deaths', 'recovered_cases'].includes(tableName)) {
    return Promise.reject(new Error('Invalid table name ' + tableName));
  }
  
  const countryNameCorrection = {
    'United States of America': 'US',
    'United States': 'US',
    'Cape Verde': 'Cabo Verde',
    'Democratic Republic of the Congo': 'Congo (Kinshasa)',
    'Republic of the Congo': 'Congo (Brazzaville)',
    'Côte d\'Ivoire': 'Cote d\'Ivoire',
    'Vatikan': 'Holy See',
    'South Korea': 'Korea, South',
    'Taiwan': 'Taiwan*',
  };
  if (Object.keys(countryNameCorrection).includes(country)) {
    country = countryNameCorrection[country];
  }
  var totalQuery = `SELECT *
    FROM bigquery-public-data.covid19_jhu_csse.` +
      tableName + `
    `;
  if (country) {
    totalQuery += `
      WHERE country_region = @country
      `;
  }

  const bigqueryClient = new BigQuery();
  return bigqueryClient
      .query({
        query: totalQuery,
        params: {country},
        location: 'US',
        timeout: 5000 
      })
      .then(resp => {
        const [rows] = resp;
        if (!rows || !rows.length) {
          return null;
        }
      
        return rows.map(r => r[Object.keys(r)[Object.keys(r).length - 1]])[rows.length - 1];
      });
}


function confirmedCases(agent) {
  console.log(
      'confirmedCases: agent.parameters = ' + JSON.stringify(agent.parameters));

  var country = agent.parameters['geo-country'];
  var resultLocation = '';
  if (country) {
    resultLocation = 'in ' + country;
  } else {
    resultLocation = 'worldwide';
  }

  return queryCovid19dataset('confirmed_cases', country)
      .then(totalConfirmed => {
        if (totalConfirmed === null) {
          return Promise.reject(
              new Error('No data found for confirmed cases ' + resultLocation));
        }
		else if (totalConfirmed < 5000)
		{
        var message = 'There are approximately' + numberWithCommas(totalConfirmed) + ' confirmed cases of ' + 'coronavirus ' + resultLocation + '.' + 'Hence it is safe to travel';
			console.log('response: ' + message);
			agent.add(message);
        }
		
		else if (totalConfirmed > 5000)
		{
        var message1 = 'There are approximately' + numberWithCommas(totalConfirmed) + ' confirmed cases of ' + 'coronavirus ' + resultLocation + '.' + 'Hence it is unsafe to travel';
			  console.log('response: ' + message1);
				agent.add(message1);
			}
		
      })
      .catch(e => {
        agent.add(
            `I'm sorry, I can't find statistics for confirmed cases ` +
            resultLocation);
        console.log(e);
      });
}
 
function death(agent) {
  console.log('death: agent.parameters = ' + JSON.stringify(agent.parameters));

  var country = agent.parameters['geo-country'];
  var resultLocation = '';
  if (country) {
    resultLocation = 'in ' + country;
  } else {
    resultLocation = 'worldwide';
  }

  return queryCovid19dataset('deaths', country)
      .then(totalDeaths => {
        if (totalDeaths === null) {
          return Promise.reject(
              new Error('No data found for deaths ' + resultLocation));
        }

        var message = 'According to Johns Hopkins University, as of today, ' +
            'approximately ' + numberWithCommas(totalDeaths) +
            ' people have died from coronavirus ' + resultLocation + '.';
        return queryCovid19dataset('confirmed_cases', country)
            .then(totalConfirmed => {
              if (!!totalConfirmed) {
                message += ' The death rate ' + resultLocation + ' is ' +
                    (totalDeaths / totalConfirmed * 100.0).toFixed(2) + '%';
              }
              console.log('response: ' + message);
              agent.add(message);
            });
      })
      .catch(e => {
        agent.add(
            `I'm sorry, I can't find statistics for deaths ` + resultLocation);
        console.log(e);
      });
}


function numberWithCommas(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}


exports.dialogflowFirebaseFulfillment =
    functions.https.onRequest((request, response) => {
      if (!!request.body.queryResult.fulfillmentMessages) {
        request.body.queryResult.fulfillmentMessages =
            request.body.queryResult.fulfillmentMessages.map(m => {
              
              return m;
            });
      }

      const agent = new WebhookClient({request, response});
      console.log(
          'Dialogflow Request headers: ' + JSON.stringify(request.headers));
      console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
  

      let intentMap = new Map();
   


      intentMap.set('coronavirus.confirmed_cases', confirmedCases);
      intentMap.set('coronavirus.death', death);	

      agent.handleRequest(intentMap);
    });
