// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';
const util = require('util');
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const admin = require('firebase-admin');
// Required for side-effects
admin.initializeApp(functions.config().firebase);
// Initialize Cloud Firestore through Firebase
const db = admin.firestore();

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

class Game {
  constructor() {
    this.gameMatrix = {
      attack: {
        attack: {player: -1, monster: -1},
        defend: {player: -1, monster: 0},
        heal: {player: 0, monster: -1}
      },
      defend: {
        attack: {player: 0, monster: -1},
        defend: {player: 0, monster: 0},
        heal: {player: 0, monster: +1}
      },
      heal: {
        attack: {player: -1, monster: 0},
        defend: {player: +1, monster: 0},
        heal: {player: +1, monster: +1}
      }
    };

    this.monsters = {
      goblin: {life: 3, damage: 1},
      orc: {life: 5, damage: 1},
      dragon: {life: 7, damage: 2}
    };
    this.actions = ['attack', 'defend', 'heal'];
    this.monsterTypes = ['goblin', 'orc', 'dragon'];

  }

  rollMonsterAction() {
    return this.actions[Math.floor(Math.random() * Math.floor(this.actions.length))];
  }

  calcRoundResult(playerAction, monsterAction) {
    return this.gameMatrix[playerAction][monsterAction];
  }
}

class CloudDB {
    constructor(db, game) {
        this.db = db;
        this.game = game;
    }
    async setUpCombat(monsterType) {
        const docRef = this.db.collection('combats').doc('combat');

        try {
            const setPromise = await docRef.set({
                monsterType: monsterType,
                player: 4,
                monster: this.game.monsters[monsterType].life
            });
            console.log("Document written with ID: ", docRef.id);
        } catch (error) {
            console.error("Error adding document: ", error);
        }
    }
    async updateHealth(playerModifier, monsterModifier) {
        const docRef = this.db.collection('combats').doc('combat');
        try {
            const doc = await docRef.get();
            if (!doc.exists) {
                console.log("No such document!");
                return;
            }
            const remainingLife = {
                monsterType: doc.data().monsterType,
                player: doc.data().player + playerModifier,
                monster: doc.data().monster + monsterModifier
            };
            const setPromise = await docRef.set(remainingLife);
            console.log("Document written with ID: ", doc.id);
            return remainingLife;
        } catch (error) {
            console.log("Error getting document:", error);

        }
    }
}

function logAgent(agent) {
  console.log(util.inspect(agent, {showHidden: true, depth: 1}));
}
const game = new Game();
const cloudDB = new CloudDB(db);

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({request, response});
  const parameters = request.body.queryResult.parameters;
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

  async function requestToFightHandler(agent) {
    //get monster-type from parameters
	//setup the combat with monster-type
	//add to agent response text that says what monster-type you chose and displays 3 next options - attack, heal and defend
      const monsterType = parameters['monster-type'];
      console.log('requestToFightHandler');
      await cloudDB.setUpCombat(monsterType);
      agent.add(`You have chosen to fight the ${monsterType} . Do you want to attack, defend or heal?`);

  }

  async function combatCommandSelectionHandler(agent) {
	//get the playerAction from parameters
	//roll the monsterAction
	//decide result
	//update health on db (get back remaining life)
	//add to agent add to agent response text that says what evey side chose and what is the life balance
	//if the fight continues, don't forget to add fighting context (agent.context.set)
	//if the fight ends - check by remaining life who won and notify the player. make sure that fighting context is not added in such a case.
      const playerAction = parameters['combat-command'];
      const monsterAction = game.rollMonsterAction();
      const roundResult = game.calcRoundResult(playerAction, monsterAction);
      console.log('combatCommandSelectionHandler');
      const remainingLife = await cloudDB.updateHealth(roundResult.player, roundResult.monster);
      agent.add(`You chose ${playerAction}, monster chose ${monsterAction}, your life in now ${remainingLife.player}, monster's life is now ${remainingLife.monster}`);
      if (remainingLife.player === 0) {
          logAgent(agent);
          agent.context.delete('fighting');
          agent.add(`You Lost`);
          logAgent(agent);
      } else if (remainingLife.monster === 0) {
          logAgent(agent);
          agent.context.delete('fighting');
          agent.add(`You win`);
          logAgent(agent);
      } else {
          agent.context.set('fighting', 1);
      }
  }



  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('combat-command-selection', combatCommandSelectionHandler);
  intentMap.set('request-to-fight', requestToFightHandler);

  agent.handleRequest(intentMap);
});
