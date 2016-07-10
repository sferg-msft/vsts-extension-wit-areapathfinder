import {IdentityRef} from "VSS/WebApi/Contracts";
//import {WebApiTeam} from "TFS/Core/Contracts";
import {Combo, IComboOptions} from "VSS/Controls/Combos";
import Controls = require("VSS/Controls");
import {IdentityPickerDropdownControl, IdentityPickerSearchControl, IIdentityPickerSearchOptions, IIdentityPickerDropdownOptions} from "VSS/Identities/Picker/Controls";
import Q = require("q");

//import {IdentityRef} from "VSS/WebApi/Contracts";
import {WebApiTeam, TeamContext} from "TFS/Core/Contracts";
import {TeamFieldValues} from "TFS/Work/Contracts";
import Core = require("TFS/Core/RestClient");
import Work = require("TFS/Work/RestClient");
//import Q = require("q");
import {ITeamAreaPaths, ITeamMembers} from "models";
//import {TeamService} from "teamService";

export interface ITeamFinderDialogConfiguration {
    project: string;
}

export class TeamFinderDialog {
    private project: string;
    private teams: WebApiTeam[];
    private teamMembers: IDictionaryStringTo<IdentityRef[]>;
    private areaPaths: IDictionaryStringTo<string[]>;

    private identityToTeamMapping: IDictionaryStringTo<string[]> = {};
    private identityIdToIdentityRefMapping: IDictionaryStringTo<IdentityRef> = {};
    private identities: string[] = [];

    private callbacks: Function[] = [];

    private areaPathCombo: Combo;

    public initialize() {
        let configuration = VSS.getConfiguration();
        this.project = configuration.properties.project;
        console.log(`project: ${this.project}`);

        let teamService = new TeamService();

        Q.fcall(() => {
        }).then(() => {
            console.log(`gettings the teams`);

            return teamService.getTeams(this.project);
        }).then((teams: WebApiTeam[]) => {
            console.log(`found ${teams.length} teams`);
            this.teams = teams;

            return teamService.getAllTeamMembers(this.project, this.teams);
        }).then((teamMembers: IDictionaryStringTo<IdentityRef[]>) => {
            console.log("loaded team members");
            this.teamMembers = teamMembers;

            return teamService.getAllTeamAreaPaths(this.project, this.teams);
        }).then((areaPaths: IDictionaryStringTo<string[]>) => {
            console.log("loaded area paths");
            this.areaPaths = areaPaths;

            this.createControls();
        }).catch((reason) => {
            debugger;
        });
    }

    public areaPathChanged(callback: (areaPath: string) => void) {
        this.callbacks.push(callback);
    }

    public getSelectedAreaPath(): string {
        return this.areaPathCombo.getValue<string>();
    }

    private createControls() {
        $.each(this.teamMembers, (team: string, members: IdentityRef[]) => {
            $.each(members, (index, member) => {
                let comboDisplayName = `${member.displayName} <${member.uniqueName}>`;
                if ($.inArray(comboDisplayName, this.identities) == -1) {
                    this.identities.push(`${member.displayName} <${member.uniqueName}>`);
                }

                if (!this.identityToTeamMapping[comboDisplayName]) {
                    this.identityToTeamMapping[comboDisplayName] = [team];
                }
                else if ($.inArray(team, this.identityToTeamMapping[comboDisplayName]) == -1) {
                    this.identityToTeamMapping[comboDisplayName].push(team);
                }

                console.log(`team: ${team}, member: ${member.uniqueName}`);
            });
        });

        let identityComboContainer = $("<div />").attr("id", "identity-combo-container").appendTo("#container");
        $("<label />").text("User: ").appendTo(identityComboContainer);

        let identityComboOptions: IComboOptions = {
            mode: "drop",
            source: this.identities,
            autoComplete: true,
            enableFilter: true,
            indexChanged: (index: number) => {
                let identity = identityCombo.getValue<string>();
                let teams = this.identityToTeamMapping[identity];

                let paths = [];
                teams.forEach((team) => {
                    paths = paths.concat(this.areaPaths[team]);
                });

                this.areaPathCombo.setSource(paths);
            }
        };

        let identityCombo = Controls.create(Combo, identityComboContainer, identityComboOptions);

        let areaPathComboContainer = $("<div />").attr("id", "area-path-combo-container").appendTo("#container");
        $("<label />").text("Area Paths: ").appendTo(areaPathComboContainer);

        let areaPathComboOptions: IComboOptions = {
            mode: "drop",
            source: [],
            indexChanged: (index: number) => {
                let areaPath = this.areaPathCombo.getText();
                this.callbacks.forEach((callback) => {
                    callback(areaPath);
                });
            }
        };

        this.areaPathCombo = Controls.create(Combo, areaPathComboContainer, areaPathComboOptions);
    }
}

export class TeamService {

    public TeamService() {
        
    }
    
    public getTeams(project: string): IPromise<WebApiTeam[]> {
        let deferred = Q.defer<WebApiTeam[]>();
        let client = Core.getClient();
        let teams: WebApiTeam[] = [];
        let top: number = 5;

        let getTeamDelegate = (project: string, skip: number) => {
            client.getTeams(project, top, skip).then((items: WebApiTeam[]) => {
                teams = teams.concat(items);
                if (items.length == top) {
                    getTeamDelegate(project, skip + top);
                }
                else {
                    deferred.resolve(teams);
                }
            });
        };

        getTeamDelegate(project, 0);

        return deferred.promise;
    }

    public getAllTeamMembers(project: string, teams: WebApiTeam[]): IPromise<IDictionaryStringTo<IdentityRef[]>> {
        let deferred = Q.defer<IDictionaryStringTo<IdentityRef[]>>();
        let promises: IPromise<ITeamMembers>[] = [];
        let teamMembers: IDictionaryStringTo<IdentityRef[]> = {};

        teams.forEach((team) => {
            promises.push(this.getTeamMembers(project, team));
        });

        Q.all(promises).then((allTeamMembers: ITeamMembers[]) => {
            allTeamMembers.forEach((members) => {
                teamMembers[members.team] = members.members;
            });

            deferred.resolve(teamMembers);
        });

        return deferred.promise;
    }

    private getTeamMembers(project: string, team: WebApiTeam): IPromise<ITeamMembers> {
        let client = Core.getClient();
        let deferred = Q.defer<ITeamMembers>();

        client.getTeamMembers(project, team.id).then((members) => {
            deferred.resolve({
                team: team.name,
                members: members
            });
        });

        return deferred.promise;
    }

    public getAllTeamAreaPaths(project: string, teams: WebApiTeam[]): IPromise<IDictionaryStringTo<string[]>> {
        let deferred = Q.defer<IDictionaryStringTo<string[]>>();
        let promises: IPromise<ITeamAreaPaths>[] = [];
        let teamAreaPaths: IDictionaryStringTo<string[]> = {};

        teams.forEach((team) => {
            promises.push(this.getTeamAreaPaths(project, team));
        });

        Q.all(promises).then((allTeamAreaPaths: ITeamAreaPaths[]) => {
            allTeamAreaPaths.forEach((teamAreaPath) => {
                teamAreaPaths[teamAreaPath.team] = teamAreaPath.areaPaths;
            });

            deferred.resolve(teamAreaPaths);
        });

        return deferred.promise;
    }

    private getTeamAreaPaths(project: string, team: WebApiTeam): IPromise<ITeamAreaPaths> {
        let workClient = Work.getClient();
        let teamContext: TeamContext = {
            project: project,
            projectId: null,
            team: null,
            teamId: team.id
        };

        let deferred = Q.defer<ITeamAreaPaths>();

        workClient.getTeamFieldValues(teamContext).then((fieldValues) => {
            if (fieldValues.field.referenceName == "System.AreaPath") {
                deferred.resolve({
                    team: team.name,
                    areaPaths: fieldValues.values.map((teamFieldValue) => {
                        return teamFieldValue.value;
                    })
                });
            }
            else {
                deferred.resolve({
                    team: team.name,
                    areaPaths: []
                });
            }
        });

        return deferred.promise;
    }
}

VSS.register("dialog", new TeamFinderDialog());