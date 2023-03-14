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

import { execSync } from 'child_process';

let hap: HAP;

export = (api: API) => {
  hap = api.hap;
  api.registerAccessory("GarageCtrl", GarageCtrl);
};


class GarageCtrl implements AccessoryPlugin {
  private readonly log: Logging;
  private readonly name: string;
  private api: API;
  private readonly service: Service;
  private readonly informationService: Service;
  private sshString: string;
  private target: string

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.name = config.name;
    this.api = api;
    this.sshString = 'ssh ' + config.sshUser + '@' + config.sshHost + ' -i ' + config.sshKey + ' ' + config.sshScript + ' ';
    this.target = (this.sshCommandExec('status') == 'closed') ? 'closed' : 'open';

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
  }

  handleCurrentDoorStateGet(callback: CharacteristicSetCallback) {
    var status = this.sshCommandExec('status');
		this.log.debug('Get Current  -- ' + status);
		
		if (status == 'closed') {
			if (this.target == 'open')
				callback(undefined, hap.Characteristic.CurrentDoorState.OPENING);
			else
				callback(undefined, hap.Characteristic.CurrentDoorState.CLOSED);
		}
		else if (status == 'open') {
			if (this.target == 'closed')
				callback(undefined, hap.Characteristic.CurrentDoorState.CLOSING);
			else
				callback(undefined, hap.Characteristic.CurrentDoorState.OPEN);
		}
		else {
			// Fallback if current is unclear
		  callback(undefined, hap.Characteristic.CurrentDoorState.OPENING);
		}
  }

  handleTargetDoorStateGet(callback: CharacteristicSetCallback) {
    if (this.target == 'closed') {
      callback(undefined, hap.Characteristic.TargetDoorState.CLOSED);
    }
    else {
      callback(undefined, hap.Characteristic.TargetDoorState.OPEN);
    }
  }

  handleTargetDoorStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {  
    if (value == Characteristic.TargetDoorState.OPEN) {
      this.target = 'open';
      this.sshCommandExec('open');
    }
    else {
      this.target = 'closed';
      this.sshCommandExec('close');
    }
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
  
  sshCommandExec(command: string): string {
  	var result = execSync(this.sshString + "'" + command + "'", { encoding: 'utf8' });
  	return result.trim();
  }
}
