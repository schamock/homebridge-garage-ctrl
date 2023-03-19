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
  private Characteristic: typeof Characteristic;
  
  private sshHost: string;
  private sshUser: string;
  private sshKey: string;
  private sshScriptStatus: string;
  private sshScriptControl: string;
  private target: string;
  private lastInconsistency: number;
  private readonly inconsistancyTolerance: number;
  

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
    this.inconsistancyTolerance = 10;

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
  }

  async handleCurrentDoorStateGet(): Promise<CharacteristicValue> {
    var status = this.sshCommandExec(this.sshScriptStatus);
    
    this.log.debug('Get Current  -- ' + status + ' ## target: ' + this.target);
    this.log.debug('Last Inconsistency: ' + this.lastInconsistency);
    
    if (status == this.target) {
      this.lastInconsistency = 0;
      if (status == 'closed')
        return this.Characteristic.CurrentDoorState.CLOSED;
      else
        return this.Characteristic.CurrentDoorState.OPEN;
    }
    else {
      if (this.lastInconsistency == 0)
        this.lastInconsistency = Math.floor(Date.now() / 1000);
      else if (Math.floor(Date.now() / 1000) - this.lastInconsistency > this.inconsistancyTolerance)
        this.target = status;
      
      if (this.target == 'open')
        return this.Characteristic.CurrentDoorState.OPENING;
      else
        return this.Characteristic.CurrentDoorState.OPENING;
    }
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
  	var command = 'ssh ' + this.sshUser + '@' + this.sshHost + ' -i ' + this.sshKey + ' ' + script + ' ';
  
  	this.log.debug('Execute: ' + command + option);
  
    var result = execSync(command + option, { encoding: 'utf8' });
    return result.trim();
  }
}
