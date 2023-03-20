import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
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
  private Characteristic: typeof Characteristic;
  
  private sshHost: string;
  private sshUser: string;
  private sshKey: string;
  private sshScriptStatus: string;
  private sshScriptControl: string;
  private target: string;
  private lastInconsistency: number;
  private readonly inconsistancyTolerance: number;
  private readonly updateFrequency: number;
  

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.name = config.name;
    this.api = api;
    this.service = new this.api.hap.Service.GarageDoorOpener(this.name);
    this.Characteristic = this.api.hap.Characteristic;
    
    this.sshHost = config.sshHost;
    this.sshUser = config.sshUser;
    this.sshKey = config.sshKey;
    this.sshScriptStatus = config.sshScriptStatus;
    this.sshScriptControl = config.sshScriptControl;
    this.lastInconsistency = 0;
    this.inconsistancyTolerance = 10; // seconds before target state will be adapted
    this.updateFrequency = 10;        // seconds between pushing current status

    this.target = (this.sshCommandExec(this.sshScriptStatus) == 'closed') ? 'closed' : 'open';

    
    this.service.getCharacteristic(this.Characteristic.CurrentDoorState)
      .onGet(this.handleCurrentDoorStateGet.bind(this)); 

    this.service.getCharacteristic(this.Characteristic.TargetDoorState)
      .onGet(this.handleTargetDoorStateGet.bind(this))
      .onSet(this.handleTargetDoorStateSet.bind(this));

    this.service.getCharacteristic(this.Characteristic.ObstructionDetected)
      .onGet(async () => {
        return false;
      });

    this.informationService = new this.api.hap.Service.AccessoryInformation()
      .setCharacteristic(this.Characteristic.Manufacturer, "Custom Manufacturer")
      .setCharacteristic(this.Characteristic.Model, "Custom Model");
    
    // Update every x seconds
    setInterval(this.updateCurrentStatus.bind(this), this.updateFrequency * 1000);
  }
  
  getCurrentStatus(): CharacteristicValue {
		var status = this.sshCommandExec(this.sshScriptStatus);
		var returnValue = this.Characteristic.CurrentDoorState.OPEN;
			
		if (status == this.target) {
      this.lastInconsistency = 0;
      returnValue = (status == 'closed') ? this.Characteristic.CurrentDoorState.CLOSED :
                                           this.Characteristic.CurrentDoorState.OPEN;
    }
    else {
    	// inconsistent state (target != status), due to...
    	// 1. ... the door is currently moving (no special treatment, if it finishes within
    	//        [this.inconsistancyTolerance] seconds)
    	// 2. ... trigger outside of homebridge: adapt target after
    	//        [this.inconsistancyTolerance] seconds
    	var now = Math.floor(Date.now() / 1000);
      if (this.lastInconsistency == 0)
        this.lastInconsistency = now;
      else if (now - this.lastInconsistency > this.inconsistancyTolerance &&
               (status == 'open' || status == 'closed')
              )
        this.target = status;
      
      // return intermediate state
      returnValue = (this.target == 'open') ?
      							 this.Characteristic.CurrentDoorState.OPENING :
      							 this.Characteristic.CurrentDoorState.CLOSING;
    }    
    return returnValue;
  }
  
  updateCurrentStatus() {
  	var currentStatus = this.getCurrentStatus();
  	// Do not push intermediate states without any request from HomeKit
  	// intermediate states will only be published via handleCurrentDoorStateGet, if
  	// HomeKit requested to do so
  	if (currentStatus == this.Characteristic.CurrentDoorState.OPEN ||
  	    currentStatus == this.Characteristic.CurrentDoorState.CLOSED) {
  		this.service.getCharacteristic(this.Characteristic.CurrentDoorState)
  		  .updateValue(currentStatus);
  		this.log.debug('updateCurrentStatus: ' +
  		               this.translateStatus(currentStatus, 'current'));
  	}
  	else {
  		this.log.debug('updateCurrentStatus: Skipped update to ' +
  		               this.translateStatus(currentStatus, 'current'));
  	}
  }

  async handleCurrentDoorStateGet(): Promise<CharacteristicValue> {
  	var currentStatus = this.getCurrentStatus();
  	this.log.debug('handleCurrentDoorStateGet: ' +
  	               this.translateStatus(currentStatus, 'current'));
    return currentStatus;
  }
  
  async handleTargetDoorStateGet(): Promise<CharacteristicValue> {
    if (this.target == 'closed')
      return this.Characteristic.TargetDoorState.CLOSED;
    else
      return this.Characteristic.TargetDoorState.OPEN;
  }

  async handleTargetDoorStateSet(value: CharacteristicValue) {
    if (value == this.Characteristic.TargetDoorState.OPEN) {
      this.target = 'open';
      this.sshCommandExec(this.sshScriptControl, 'open');
    }
    else {
      this.target = 'closed';
      this.sshCommandExec(this.sshScriptControl, 'close');
    }
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
  
  sshCommandExec(script: string, option: string = ''): string {
  	var command = 'ssh ' + this.sshUser + '@' + this.sshHost + ' -i ' + this.sshKey +
  	              ' ' + script + ' ' + option;
    var result = execSync(command, { encoding: 'utf8' }).trim();
    
    this.log.debug('Execute: ' + script + ' ## ' + result);
    
    return result;
  }
  
  translateStatus(value: CharacteristicValue, type: string): string {
  	if (type == 'current') {
  		switch (value) {
  			case this.Characteristic.CurrentDoorState.OPEN:
  				return 'open';
  			case this.Characteristic.CurrentDoorState.CLOSED:
  				return 'closed';
  			case this.Characteristic.CurrentDoorState.OPENING:
  				return 'opening';
  			case this.Characteristic.CurrentDoorState.CLOSING:
  				return 'closing';
  			case this.Characteristic.CurrentDoorState.STOPPED:
  				return 'stopped';
  			default:
  				return 'error (current)';
  		}
  	}
  	else if (type == 'target') {
  		switch (value) {
  			case this.Characteristic.TargetDoorState.OPEN:
  				return 'open';
  			case this.Characteristic.TargetDoorState.CLOSED:
  				return 'closed';
  			default:
  				return 'error (target)';
  		}
  	}
  	else
  		return 'error (?)';
  }
}
