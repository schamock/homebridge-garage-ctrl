import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  Characteristic,
  HAP,
  Logging,
  Service
} from "homebridge";

// This seams to be problematic. No clue, how include simple-ssh the right way :(
import SSH from "simple-ssh";
//import * as SSH from 'simple-ssh';


let hap: HAP;

export = (api: API) => {
  hap = api.hap;
  api.registerAccessory("GarageCtrl", GarageCtrl);
};


class GarageCtrl implements AccessoryPlugin {
  private readonly log: Logging;
  private readonly name: string;
  private readonly sshHost: string;
  private readonly sshUser: string;
  private readonly sshKey: string;
  private api: API;
  private isOpen: boolean;
  private readonly service: Service;
  private readonly informationService: Service;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.name = config.name;
    this.sshHost = config.sshHost;
    this.sshUser = config.sshUser;
    this.sshKey = config.sshKey;
    this.api = api;
    this.isOpen = true;

    this.service = new hap.Service.GarageDoorOpener(this.name);
    
    this.service.getCharacteristic(hap.Characteristic.CurrentDoorState)
      .on(CharacteristicEventTypes.GET, this.handleCurrentDoorStateGet.bind(this));

    this.service.getCharacteristic(hap.Characteristic.TargetDoorState)
      .on(CharacteristicEventTypes.GET, this.handleTargetDoorStateGet.bind(this))
      .on(CharacteristicEventTypes.SET, this.handleTargetDoorStateSet.bind(this));

    this.service.getCharacteristic(hap.Characteristic.ObstructionDetected)
      .on(CharacteristicEventTypes.GET, this.handleObstructionDetectedGet.bind(this));

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Custom Manufacturer")
      .setCharacteristic(hap.Characteristic.Model, "Custom Model");

    log.info("GarageCtrl finished initializing: " + this.name + " / host: " + this.sshHost);
  }

  handleCurrentDoorStateGet(callback: CharacteristicSetCallback) {
    // This is just for testing. A soon as I include this statement, I'm running into segfaults
  	var connection = new SSH({
      host: this.sshHost,
      user: this.sshUser,
      key:  this.sshKey
    });
    
    this.log.debug('Triggered GET CurrentDoorState');

    if (this.isOpen) {
      callback(undefined, hap.Characteristic.CurrentDoorState.OPEN);
    }
    else {
      callback(undefined, hap.Characteristic.CurrentDoorState.CLOSED);
    }
  }
  
  handleTargetDoorStateGet(callback: CharacteristicSetCallback) {
    this.log.debug('Triggered GET TargetDoorState');
    if (this.isOpen) {
      callback(undefined, hap.Characteristic.TargetDoorState.OPEN);
    }
    else {
      callback(undefined, hap.Characteristic.TargetDoorState.CLOSED);
    }
  }

  handleTargetDoorStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (value == Characteristic.TargetDoorState.OPEN) {
      this.isOpen = true;
    }
    else {
      this.isOpen = false;
    }

    this.log.debug('Triggered SET TargetDoorState, Input: ' + value);
    this.log.debug('Triggered SET TargetDoorState, Result: ' + this.isOpen);
    callback();
  }

  handleObstructionDetectedGet(callback: CharacteristicSetCallback) {
    callback(undefined, false);
  }

  identify(): void {
    this.log("Identify!");
  }

  getServices(): Service[] {
    return [
      this.informationService,
      this.service,
    ];
  }
}
