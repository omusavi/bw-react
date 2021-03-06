import "./index.css"
import 'primereact/resources/themes/nova-light/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import 'primeflex/primeflex.css'
import React from 'react';
import svgFiles from "./images"
import { ParameterView } from './ParameterView';
import ParameterModel from './ParameterModel';
import { bashTemplates } from './bashTemplates';
import SplitPane from 'react-split-pane';
import trim from 'lodash-es/trim';
import trimEnd from 'lodash-es/trimEnd';
import trimStart from 'lodash-es/trimStart';
import { camelCase, template } from "lodash-es";
import { uniqueId } from 'lodash-es';
import { padEnd } from 'lodash-es'
import { TabView, TabPanel } from 'primereact/tabview';
import { Toolbar } from 'primereact/toolbar';
import { Button } from 'primereact/button';
import { ToggleButton } from "primereact/togglebutton"
import { InputText } from "primereact/inputtext"
import { Dropdown } from "primereact/dropdown"
import { Growl, GrowlMessage } from 'primereact/growl';
import Cookies, { Cookie } from "universal-cookie"
import AceEditor from 'react-ace';
import { YesNoDialog, YesNoResponse } from "./askUserYesNoDlg";

import "brace/mode/sh"
import "brace/mode/json"
import "brace/theme/xcode"
import "brace/theme/cobalt"
import "./ParameterView.css"
import "./App.css"
import { ParseBash, IParseState } from './parseBash';




export interface IErrorMessage {
    severity: "warning" | "error" | "info";
    message: string;
    key: string;
    selected?: boolean;
    Parameter?: ParameterModel
}
export interface IBuiltInParameterName {
    Create?: string,
    Verify?: string,
    Delete?: string,
    LoggingSupport?: string,
    InputFileSupport?: string,
    VerboseSupport?: string
}

enum ValidationOptions {
    AllowBlankValues = 1,
    // tslint:disable-next-line
    ClearErrors = 1 << 2,
    // tslint:disable-next-line
    ValidateOnly = 1 << 3,
    // tslint:disable-next-line
    Growl = 1 << 4
}


interface IAppState {
    //
    //  these get replaced in this.stringify
    menuOpen: boolean;
    json: string;
    bash: string;
    input: string;
    SelectedParameter?: ParameterModel;
    debugConfig: string;
    inputJson: string;
    mode: string; // one of "light" or "dark"
    builtInParameterSelected: string | null;
    generateBashScript: boolean;

    dialogVisible: boolean;
    dialogMessage: string;
    dialogCallback: YesNoResponse;
    errors: IErrorMessage[];
    selectedError: IErrorMessage | undefined;
    // keep the state of the parameter list so shrinking width doens't break layout
    parameterListHeight: string;
    activeTabIndex: number;
    //
    //  these get stringified
    //  these must match https://github.com/joelong01/Bash-Wizard/blob/master/bashGeneratorSharedModels/ConfigModel.cs
    ScriptName: string;
    Description: string;
    Parameters: ParameterModel[];


}


class App extends React.Component<{}, IAppState> {

    private growl = React.createRef<Growl>();
    private _settingState: boolean = false;
    private _loading: boolean = false;
    private cookie: Cookie = new Cookies();
    private UserCode: string = "";
    private Version: string = "0.907";
    private builtInParameters: { [key in keyof IBuiltInParameterName]: ParameterModel } = {}; // this isn't in the this.state object because it doesn't affect the UI


    constructor(props: {}) {
        super(props);
        let savedMode = this.cookie.get("mode");

        if (savedMode === "" || savedMode === null) {
            savedMode = "dark";
        }
        const params: ParameterModel[] = []
        this.state =
            {
                //
                //  these get replaced in this.stringify
                menuOpen: true,
                json: "",
                bash: "",
                input: "",
                mode: savedMode,
                debugConfig: "",
                inputJson: "",
                builtInParameterSelected: null,
                parameterListHeight: "calc(100% - 115px)",
                generateBashScript: true,
                dialogVisible: false,
                dialogMessage: "",
                dialogCallback: this.yesNoReset,
                errors: [],
                selectedError: undefined,
                activeTabIndex: 0,
                // these do not get replaced
                ScriptName: "",
                Description: "",
                Parameters: params,
            }
    }

    public componentDidMount = () => {
        window.addEventListener<"resize">('resize', this.handleResize);
        this.handleResize();
    }
    public componentWillUnmount = () => {
        window.removeEventListener<"resize">('resize', this.handleResize);
    }
    //
    //  when the prime react toolbar changes width, it goes to 2 row and then 3 row state
    //  this means that if we set the height of the parameter list in css, then we have to
    //  deal with 3 different calcs - instead i'll do it hear by listening to the window
    //  size event and calculating the height of the parameter list based on the height of 
    //  the toolbar.  note that 64px is the size of the div we enter script name in plus
    //  various margins.
    private handleResize = () => {

        const toolbar: HTMLElement | null = window.document.getElementById("toolbar");
        if (toolbar !== null) {
            const htStyle: string = `calc(100% - ${toolbar.clientHeight + 69}px)`
            this.setState({ parameterListHeight: htStyle });
        }

    };
    private saveSettings = (): void => {
        this.cookie.set("mode", this.state.mode);

    }

    private getDebugConfig = (scriptDirectory: string): string => {
        let sb: string = "";
        try {

            let scriptName: string = this.state.ScriptName
            let slashes: string = "/\\"
            let quotes: string = "\"\'"
            let scriptDir: string = trimEnd(scriptDirectory, slashes)
            scriptDir = trimStart(scriptDir, "./")
            scriptName = trimStart(scriptName, slashes);
            const nl: string = "\n";
            sb = `{${nl}`
            sb += `${this.Tabs(1)}\"type\": \"bashdb\",${nl}`
            sb += `${this.Tabs(1)}\"request\": \"launch\",${nl}`
            sb += `${this.Tabs(1)}\"name\": \"Debug ${this.state.ScriptName}\",${nl}`
            sb += `${this.Tabs(1)}\"cwd\": \"\${workspaceFolder}\",${nl}`

            sb += `${this.Tabs(1)}\"program\": \"\${workspaceFolder}/${scriptDir}/${this.state.ScriptName}\",${nl}`
            sb += `${this.Tabs(1)}\"args\": [${nl}`
            for (let param of this.state.Parameters) {
                const p: string = trimEnd(trimStart(param.default, quotes), quotes);
                sb += `${this.Tabs(2)}\"--${param.longParameter}\",${nl}${this.Tabs(2)}\"${p}\",${nl}`
            }


            sb += `${this.Tabs(1)}]${nl}`
            sb += `}`
        }
        catch (e) {
            return `Exception generating config\n\nException Info:\n===============\n${e.message}`
        }

        return sb;

    }


    private onRefresh = async (): Promise<void> => {
        switch (this.state.activeTabIndex) {
            case 0:
                await this.bashToUi(this.state.bash);
                break;
            case 1:
                await this.jsonToUi(this.state.json);
                break;
            default:
                break;
        }


    }

    private menuDeleteParameter = async (): Promise<void> => {

        if (this.state.SelectedParameter !== undefined) {
            const toDelete: ParameterModel = this.state.SelectedParameter;
            this.state.SelectedParameter.selected = false;
            let index: number = this.state.Parameters.indexOf(this.state.SelectedParameter)
            if (index !== -1) {
                await this.deleteParameter(toDelete) // after this point the state has been changed
                //
                //  highlight the item previous to the deleted one, unless it was the first one
                const newLength = this.state.Parameters.length;
                if (newLength === 0) {
                    return;
                }
                if (index === newLength) {
                    index--;
                }

                //
                //  select the first one if the first one was deleted, otherwise select the previous one
                this.state.Parameters[index].selected = true;
            }
            else {
                console.log("index of selected item is -1!")
            }
        }

    }


    private reset = () => {
        this.state.Parameters.map((el: ParameterModel) => {
            el.removeNotify(this.onPropertyChanged);
        }
        );
        this.builtInParameters = {}
        this.setState({
            json: "",
            bash: "",
            input: "",

            debugConfig: "",
            inputJson: "",
            builtInParameterSelected: null,



            // these do not get replaced
            ScriptName: "",
            Description: "",
            Parameters: [],

        });
    }

    private updateAllText = async () => {
        await this.setStateAsync({ json: this.stringify(), bash: this.toBash(), input: this.toInput(), debugConfig: this.getDebugConfig("BashScripts"), inputJson: this.toInput() });

    }

    private changedScriptName = async (e: React.FormEvent<HTMLInputElement>) => {
        await this.setStateAsync({ ScriptName: e.currentTarget.value })
        await this.updateAllText();

    }
    private changedDescription = async (e: React.FormEvent<HTMLInputElement>) => {
        await this.setStateAsync({ Description: e.currentTarget.value })
        // tslint:disable-next-line
        this.clearErrorsAndValidateParameters(ValidationOptions.ClearErrors | ValidationOptions.Growl);
        await this.updateAllText();
    }
    private Tabs = (n: number): string => {
        let s: string = "";
        for (let i: number = 0; i < n; i++) {
            s += "    ";
        }
        return s;
    }




    private replaceAll = (from: string, search: string, replace: string): string => {
        // if replace is not sent, return original string otherwise it will
        // replace search string with 'undefined'.
        if (replace === undefined) {
            return from;
        }

        return from.replace(new RegExp('[' + search + ']', 'g'), replace);
    };

    //
    //  given the state of the app, return a valid bash script
    private toBash = (): string => {

        console.log("ToBash BuiltIns: %o", this.builtInParameters);

        try {

            if (this.state.Parameters.length === 0) {
                //
                //  if there are no parameters, just mark it as user code
                return "# --- BEGIN USER CODE ---\n" + this.UserCode + "\n# --- END USER CODE ---";
            }

            let sbBashScript: string = bashTemplates.bashTemplate;
            sbBashScript = sbBashScript.replace("__VERSION__", this.Version);
            let logTemplate: string = bashTemplates.logTemplate;
            let parseInputTemplate: string = bashTemplates.parseInputTemplate;
            let requiredVariablesTemplate: string = bashTemplates.requiredVariablesTemplate;
            let verifyCreateDeleteTemplate: string = bashTemplates.verifyCreateDelete;
            let endLogTemplate: string = bashTemplates.endOfBash;

            let nl: string = "\n";
            let usageLine: string = `${this.Tabs(1)}echo \"${this.state.Description}\"\n${this.Tabs(1)}echo \"\"\n${this.Tabs(1)}echo \"Usage: $0  `;
            let usageInfo: string = `${this.Tabs(1)}echo \"\"\n`;
            let echoInput: string = `\"${this.state.ScriptName}:\"${nl}`;
            let shortOptions: string = "";
            let longOptions: string = "";
            let inputCase: string = "";
            let inputDeclarations: string = "";
            let parseInputFile: string = "";
            let requiredFilesIf: string = "";
            let loggingSupport: string = "";

            const longestLongParameter: number = Math.max(...(this.state.Parameters.map(param => param.longParameter.length))) + 4;

            for (let param of this.state.Parameters) {
                //
                // usage
                let required: string = (param.requiredParameter) ? "Required    " : "Optional    ";
                usageLine += `-${param.shortParameter}|--${param.longParameter} `
                usageInfo += `${this.Tabs(1)}echo \" -${param.shortParameter} | --${padEnd(param.longParameter, longestLongParameter, " ")} ${required} ${param.description}\"${nl}`

                //
                // the  echoInput function                
                echoInput += `${this.Tabs(1)}echo -n \"${this.Tabs(1)}${padEnd(param.longParameter, longestLongParameter, '.')} \"${nl}`;
                echoInput += `${this.Tabs(1)}echoInfo \"\$${param.variableName}\"${nl}`;


                //
                //  OPTIONS, LONGOPTS
                let colon: string = (param.requiresInputString) ? ":" : "";
                shortOptions += `${param.shortParameter}${colon}`
                longOptions += `${param.longParameter}${colon},`

                // input Case
                inputCase += `${this.Tabs(2)}-${param.shortParameter} | --${param.longParameter})${nl}`
                inputCase += `${this.Tabs(3)}${param.variableName}=${param.valueIfSet}${nl}`
                inputCase += param.requiresInputString ? `${this.Tabs(3)}shift 2\n` : `${this.Tabs(3)}shift 1${nl}`
                inputCase += `${this.Tabs(3)};;\n`

                // declare variables
                inputDeclarations += `declare ${param.variableName}=${param.default}${nl}`
                if (this.builtInParameters.InputFileSupport !== undefined && param.variableName !== "inputFile") {
                    // parse input file
                    parseInputFile += `${this.Tabs(1)}${param.variableName}=$(echo \"\${configSection}\" | jq \'.[\"${param.longParameter}\"]\' --raw-output)${nl}`
                }

                // if statement for the required files

                if (param.requiredParameter) {
                    requiredFilesIf += `[ -z \"\${${param.variableName}}\" ] || `
                }

            }
            //
            //  phase 2 - fix up any of the string created above         

            usageLine += "\""

            //  remove last line / character
            longOptions = longOptions.slice(0, -1);
            inputCase = inputCase.slice(0, -1)
            usageInfo = usageInfo.slice(0, -1)


            if (requiredFilesIf.length > 0) {
                requiredFilesIf = requiredFilesIf.slice(0, -4); // removes the " || " at the end
                requiredVariablesTemplate = requiredVariablesTemplate.replace("__REQUIRED_FILES_IF__", requiredFilesIf)
            }
            else {
                requiredVariablesTemplate = "";
            }

            if (this.builtInParameters.LoggingSupport !== undefined) {
                logTemplate = logTemplate.replace("__LOG_FILE_NAME__", this.state.ScriptName + ".log");
            }
            else {
                logTemplate = "";
            }

            //
            //  phase 3 - replace the strings in the templates
            sbBashScript = sbBashScript.replace("__USAGE_LINE__", usageLine);
            sbBashScript = sbBashScript.replace("__USAGE__", usageInfo);
            sbBashScript = sbBashScript.replace("__ECHO__", echoInput);
            sbBashScript = sbBashScript.replace("__SHORT_OPTIONS__", shortOptions);
            sbBashScript = sbBashScript.replace("__LONG_OPTIONS__", longOptions);
            sbBashScript = sbBashScript.replace("__INPUT_CASE__", inputCase);
            sbBashScript = sbBashScript.replace("__INPUT_DECLARATION__", inputDeclarations);

            let inputOverridesRequired: string = (this.builtInParameters.InputFileSupport !== undefined) ? "echoWarning \"Parameters can be passed in the command line or in the input file. The command line overrides the setting in the input file.\"" : "";
            sbBashScript = sbBashScript.replace("__USAGE_INPUT_STATEMENT__", inputOverridesRequired);

            if (this.builtInParameters.InputFileSupport !== undefined) {
                parseInputTemplate = parseInputTemplate.replace(/__SCRIPT_NAME__/g, this.state.ScriptName);
                parseInputTemplate = parseInputTemplate.replace("__FILE_TO_SETTINGS__", parseInputFile);
                sbBashScript = sbBashScript.replace("___PARSE_INPUT_FILE___", parseInputTemplate);
                sbBashScript = sbBashScript.replace("__JQ_DEPENDENCY__", bashTemplates.jqDependency);

            }
            else {
                sbBashScript = sbBashScript.replace("___PARSE_INPUT_FILE___", "");
                sbBashScript = sbBashScript.replace("__JQ_DEPENDENCY__", "");
            }

            sbBashScript = sbBashScript.replace("__REQUIRED_PARAMETERS__", requiredVariablesTemplate);
            sbBashScript = sbBashScript.replace("__LOGGING_SUPPORT_", logTemplate);
            sbBashScript = sbBashScript.replace("__END_LOGGING_SUPPORT__", this.builtInParameters.LoggingSupport !== undefined ? endLogTemplate : "");

            if (this.builtInParameters.Create !== undefined && this.builtInParameters.Verify !== undefined && this.builtInParameters.Delete !== undefined) {
                if (!this.functionExists(this.UserCode, "onVerify") && !this.functionExists(this.UserCode, "onDelete") && !this.functionExists(this.UserCode, "onCreate")) {
                    //
                    //  if they don't have the functions, add the template code
                    sbBashScript = sbBashScript.replace("__USER_CODE_1__", verifyCreateDeleteTemplate);
                }
            }

            if (this.builtInParameters.VerboseSupport !== undefined) {
                sbBashScript = sbBashScript.replace("__VERBOSE_ECHO__", bashTemplates.verboseEcho);
            }
            else {
                sbBashScript = sbBashScript.replace("__VERBOSE_ECHO__", "");
            }
            /*
              replace anyplace we have 3 new lines with 2 new lines.  this will get rid of double black lines...
              e.g. 
                        function onCreate() { (\n)
                            (\n)
                            (\n)
                        }
            becomes
                        function onCreate() {(\n)
                            (\n)
                        }
            */
            sbBashScript = sbBashScript.replace(/\n\n\n/g, "\n\n");
            //
            // put the user code where it belongs -- it might contain the functions already

            sbBashScript = sbBashScript.replace("__USER_CODE_1__", this.UserCode);

            return sbBashScript;
        }
        catch (e) {
            return `something went wrong.  ${e}`
        }

    }

    private functionExists = (bashScript: string, name: string): boolean => {
        if (bashScript === "") {
            return false;
        }

        if (bashScript.indexOf(`function ${name}()`) !== -1) {
            return true;
        }


        return false;
    }

    //
    //  this is an "opt in" replacer -- if you want something in the json you have to add it here
    private jsonReplacer = (name: string, value: any) => {

        if (name === "" || name === "ScriptName" || name === "Parameters") {
            return value;
        }
        //
        //  JSON.strinfigy passes in indexes as strings for array elements                
        if (!isNaN(Number(name))) {
            return value;
        }

        return ParameterModel.jsonReplacer(name, value);

    }
    public stringify = () => {

        const jsonDoc = JSON.stringify(this.state, this.jsonReplacer, 4);
        return jsonDoc;
    }

    private toInput = () => {
        const nl: string = "\n";
        let sb: string = `${this.Tabs(1)}\"${this.state.ScriptName}\": { ${nl}`
        let paramKeyValuePairs: string = "";
        const quotes: string = '"'
        for (let param of this.state.Parameters) {
            let defValue: string = param.default;
            defValue = trim(defValue);
            defValue = trimEnd(defValue, quotes);
            defValue = defValue.replace("\\", "\\\\");
            paramKeyValuePairs += `${this.Tabs(2)}\"${param.longParameter}\": \"${defValue}\",${nl}`
        };
        //  delete trailing "," "\n" and spaces
        paramKeyValuePairs = trimEnd(paramKeyValuePairs, ',\n');


        sb += paramKeyValuePairs;
        sb += `${nl}${this.Tabs(1)}}`
        return sb
    }

    private deleteParameter = async (parameter: ParameterModel) => {
        if (parameter === undefined) {
            console.log("App.DeleteParameter: WARNING:  ATTEMPTING TO DELETE AN UNDEFINED PARAMETER")
            return;
        }
        let array: ParameterModel[] = [...this.state.Parameters]
        const index: number = array.indexOf(parameter)
        if (index === -1) {
            console.log("App.DeleteParameter: WARNING: PARAMETER NOT FOUND IN ARRAY TO DELETE")
            return;
        }

        for (let builtInName in this.builtInParameters) {
            if (this.builtInParameters[builtInName] === parameter) {
                // console.log(`deleting built in parameter: ${builtInName}`);
                this.builtInParameters[builtInName] = undefined;
            }
        }

        parameter.removeNotify(this.onPropertyChanged);
        array.splice(index, 1);

        await this.setStateAsync({ Parameters: array })
        await this.updateAllText();

    }

    private addErrorMessage = (severity: "warning" | "error" | "info", message: string, parameter?: ParameterModel) => {
        let newMsg = {} as IErrorMessage;
        newMsg.severity = severity;
        newMsg.message = message;
        newMsg.selected = false;
        newMsg.Parameter = parameter;
        newMsg.key = uniqueId("error:");
        this.growl.current!.show({ severity: "error", summary: "Error Message", detail: message + "\n\rSee \"Message\" tab." });
        this.setState({ errors: [...this.state.errors, newMsg] });
    }

    private deleteParameterByLongName = async (longName: string) => {
        let index: number = 0;
        for (index = 0; index < this.state.Parameters.length; index++) {
            if (this.state.Parameters[index].longParameter === longName) {
                await this.deleteParameter(this.state.Parameters[index]);
                return;
            }
        }
    }

    private parameterExists = (longName: string): ParameterModel | undefined => {
        for (let parameter of this.state.Parameters) {
            if (parameter.longParameter === longName) {
                return parameter;
            }
        }
        return undefined;
    }

    private shortParameterExists = (shortParam: string): boolean => {
        for (let parameter of this.state.Parameters) {
            if (parameter.shortParameter === shortParam) {
                return true;
            }
        }
        return false;
    }

    //
    //  returns an array of validation errors with no side effects
    //
    //  
    private getValidationErrors = (options: ValidationOptions): IErrorMessage[] => {
        const errors: IErrorMessage[] = []
        const nameObject = Object.create(null);
        const variableObject = {}
        for (let param of this.state.Parameters) {
            // tslint:disable-next-line

            if (param.longParameter === "" && param.shortParameter === "") {
                errors.push({ severity: "error", Parameter: param, message: "All Long Names, Short Names, and Variable Names must be non-empty.", key: uniqueId("ERROR") });
            }

            if (param.longParameter in nameObject && param.longParameter !== "") {
                errors.push({ severity: "error", Parameter: param, message: `you already have \"${param.longParameter}\" as Long Parameter`, key: uniqueId("ERROR") });
            }
            else {
                nameObject[param.longParameter] = param;
            }
            if (param.shortParameter in nameObject && param.shortParameter !== "") {
                errors.push({ severity: "error", Parameter: param, message: `you already have \"${param.shortParameter}\" as Short Parameter`, key: uniqueId("ERROR") });
            }
            else {
                nameObject[param.shortParameter] = param;
            }

            if (param.variableName in variableObject && param.variableName !== "") {
                errors.push({ severity: "error", Parameter: param, message: `you already have \"${param.variableName}\" as Variable Name`, key: uniqueId("ERROR") });
            }
            else {
                variableObject[param.variableName] = param;
            }

            if (param.requiresInputString && param.valueIfSet !== "$2") {
                errors.push({ severity: "error", Parameter: param, message: `parameter \"${param.longParameter}\" has Required Input String = true but hasn't set the Value if Set to $2. This is an invalid combination`, key: uniqueId("ERROR") });
            }
            if (!param.requiresInputString && param.valueIfSet === "$2") {
                errors.push({ severity: "error", Parameter: param, message: `parameter \"${param.longParameter}\" has Required Input String = false but has set the Value if Set to $2. This is an invalid combination`, key: uniqueId("ERROR") });
            }
        }

        //
        //  I'm taking out these chars because they are "special" in JSON.  I found that the ":" messed up JQ processing
        //  and it seems a small price to pay to not take any risks with the names.  Note that we always trim() the names
        //  in the ParameterOrScriptData_PropertyChanged method
        //  
        const illegalNameChars: string = ":{}[]\\\'\"";
        if (this.state.ScriptName !== "") {
            for (let c of illegalNameChars) {
                if (this.state.ScriptName.includes(c)) {
                    errors.push({ severity: "error", Parameter: undefined, message: "The following characters are illegal in the Script Name: :{}[]\\\'\"", key: uniqueId("ERROR") });
                    break;
                }
            }
        }
        if (this.state.Description !== "") {
            for (let c of illegalNameChars) {
                if (this.state.Description.includes(c)) {
                    errors.push({ severity: "error", Parameter: undefined, message: "The following characters are illegal in the Description::{}[]\\\'\"", key: uniqueId("ERROR") });
                    break;
                }
            }
        }

        return errors;
    }

    //
    //  make sure we don't have any errors in the parameters.  if there are we growl them and add them to the Message list.
    //  Note that we clear all errors each time this is run so that if the user fixes anything (e.g. changes something), we
    //  rerun this
    //
    /// returns true if the parameters are valid and false if they are not (e.g. an error was generated)
    private clearErrorsAndValidateParameters = (options: ValidationOptions = ValidationOptions.ClearErrors): boolean => {

        const newErrors: IErrorMessage[] = this.getValidationErrors(options);

        //
        //  putting this here means you can't do ValidateOnly and anything else
        // tslint:disable-next-line
        if (options & ValidationOptions.ValidateOnly) {
            return newErrors.length === 0;
        }

        // tslint:disable-next-line
        if (options & ValidationOptions.ClearErrors) {
            this.setState({ errors: [] });
        }
        // tslint:disable-next-line
        if (options & ValidationOptions.Growl) {
            for (let err of newErrors) {
                this.growl.current!.show({ severity: "error", summary: "Error Message", detail: err.message });
            }
        }

        newErrors.concat(this.state.errors);

        this.setState({ errors: newErrors });
        return this.state.errors.length === 0;
    }

    //
    //  this is called by the model
    public onPropertyChanged = async (parameter: ParameterModel, name: string) => {
        if (this._loading === true) {
            return;
        }
        if (this._settingState === true) {
            return;
        }

        if (name === "focus") {
            return;
        }


        try {

            this._settingState = true;
            if (name === "selected") {
                if (this.state.SelectedParameter === parameter) {
                    return;
                }
                if (this.state.SelectedParameter !== undefined) {
                    this.state.SelectedParameter.selected = false; // old selected no longer selected
                }
                await this.setStateAsync({ SelectedParameter: parameter })
                return;
            }

            if (name === "longParameter") {
                //
                //  attempt to autofill short name and variable name
                //  

                if (parameter.shortParameter === "") {
                    for (const c of parameter.longParameter) {

                        if (c === "") {
                            continue;
                        }
                        if (!this.shortParameterExists(c)) {
                            parameter.shortParameter = c;

                            break;
                        }
                    }
                }
                if (parameter.shortParameter === "") {
                    this.addErrorMessage("warning", "Unable to auto generate a Short Parameter", parameter);
                    return;
                }

                if (parameter.variableName === "") {
                    parameter.variableName = camelCase(parameter.longParameter);
                }

            }

            // tslint:disable-next-line
            this.clearErrorsAndValidateParameters(ValidationOptions.ClearErrors | ValidationOptions.Growl); // this will append Errors and leave Warnings
        }
        finally {
            this._settingState = false;

            await this.updateAllText();
        }

    }


    private addParameter = async (model: ParameterModel, select: boolean) => {

        model.uniqueName = uniqueId("PARAMETER_DIV_")
        model.registerNotify(this.onPropertyChanged)
        model.selected = select;

        /*  const list: ParameterModel[] = this.state.Parameters.concat(model);
         await this.setStateAsync({ Parameters: list }) */

        this.setState({ Parameters: [...this.state.Parameters, model] });
        await this.updateAllText();

        // tslint:disable-next-line
        this.clearErrorsAndValidateParameters(ValidationOptions.ClearErrors);


    }

    private addInputFileParameter = async () => {
        //
        //  this way we always go back to the default - e.g. if somebody messes with the built in then
        //  they can just readd it and the right thing will happen.
        if (this.builtInParameters.InputFileSupport !== undefined) {
            await this.deleteParameter(this.builtInParameters.InputFileSupport);
        }

        let p: ParameterModel = new ParameterModel();
        p.default = "";
        p.description = "the name of the input file. pay attention to $PWD when setting this";
        p.longParameter = "input-file";
        p.shortParameter = "i";
        p.requiresInputString = true;
        p.requiredParameter = false;
        p.valueIfSet = "$2";
        p.variableName = "inputFile";
        this.builtInParameters.InputFileSupport = p;
        await this.addParameter(p, true);

    }
    private addVerboseParameter = async () => {
        //
        //  this way we always go back to the default - e.g. if somebody messes with the built in then
        //  they can just readd it and the right thing will happen.
        if (this.builtInParameters.VerboseSupport !== undefined) {
            await this.deleteParameter(this.builtInParameters.VerboseSupport);
        }

        let p: ParameterModel = new ParameterModel();
        p.default = "false";
        p.description = "echos script data";
        p.longParameter = "verbose";
        p.shortParameter = "b";
        p.requiresInputString = false;
        p.requiredParameter = false;
        p.valueIfSet = "true";
        p.variableName = "verbose"
        this.builtInParameters.VerboseSupport = p;
        await this.addParameter(p, true);


    }
    private addloggingParameter = async () => {

        //
        //  this way we always go back to the default - e.g. if somebody messes with the built in then
        //  they can just readd it and the right thing will happen.
        if (this.builtInParameters.LoggingSupport !== undefined) {
            await this.deleteParameter(this.builtInParameters.LoggingSupport);
        }

        let p: ParameterModel = new ParameterModel();
        p.longParameter = "log-directory";
        p.shortParameter = "l";
        p.description = "Directory for the log file. The log file name will be based on the script name.";
        p.variableName = "logDirectory";
        p.default = "\"./\"";
        p.requiresInputString = true;
        p.requiredParameter = false;
        p.valueIfSet = "$2";
        this.builtInParameters.LoggingSupport = p;
        await this.addParameter(p, true);

    }

    private addcvdParameters = async () => {

        let params: ParameterModel[] = []
        //
        //  this way we always go back to the default - e.g. if somebody messes with the built in then
        //  they can just readd it and the right thing will happen.
        if (this.builtInParameters.Create !== undefined) {
            await this.deleteParameter(this.builtInParameters.Create);
        }
        let p: ParameterModel = new ParameterModel();
        p.longParameter = "create";
        p.shortParameter = "c";
        p.description = "calls the onCreate function in the script";
        p.variableName = "create";
        p.default = "false";
        p.requiresInputString = false;
        p.requiredParameter = false;
        p.valueIfSet = "true";
        p.uniqueName = uniqueId("PARAMETER_DIV_")
        p.registerNotify(this.onPropertyChanged)
        p.selected = false;
        this.builtInParameters.Create = p;
        params.push(p);
        if (this.builtInParameters.Verify !== undefined) {
            await this.deleteParameter(this.builtInParameters.Verify);
        }
        p = new ParameterModel();
        p.longParameter = "verify";
        p.shortParameter = "v";
        p.description = "calls the onVerify function in the script";
        p.variableName = "verify";
        p.default = "false";
        p.requiresInputString = false;
        p.requiredParameter = false;
        p.valueIfSet = "true";
        p.uniqueName = uniqueId("PARAMETER_DIV_")
        p.registerNotify(this.onPropertyChanged)
        p.selected = false;
        this.builtInParameters.Verify = p;
        params.push(p);

        if (this.builtInParameters.Delete !== undefined) {
            await this.deleteParameter(this.builtInParameters.Delete);
        }
        p = new ParameterModel();
        p.longParameter = "delete";
        p.shortParameter = "d";
        p.description = "calls the onDelete function in the script";
        p.variableName = "delete";
        p.default = "false";
        p.requiresInputString = false;
        p.requiredParameter = false;
        p.valueIfSet = "true";
        p.uniqueName = uniqueId("PARAMETER_DIV_")
        p.registerNotify(this.onPropertyChanged)
        p.selected = false;
        this.builtInParameters.Delete = p;
        params.push(p);

        this.setState({ Parameters: [...this.state.Parameters, ...params] });

    }
    //
    //  message handler for the toolbar button "add"
    private addBuiltIn = async () => {
        switch (this.state.builtInParameterSelected) {
            case "inputFileParameter":
                await this.addInputFileParameter();
                break;
            case "verboseParameter":
                await this.addVerboseParameter();
                break;
            case "loggingParameter":
                await this.addloggingParameter();
                break;
            case "cvdParameters":
                await this.addcvdParameters();
                break;
            case "All":
                await this.addInputFileParameter();
                await this.addVerboseParameter();
                await this.addloggingParameter();
                await this.addcvdParameters();
                break;
            default:
                console.log(`WARNING: ${this.state.builtInParameterSelected} is not supported in addBuiltIn`)
                break;

        }
    }


    private setStateAsync = (newState: object): Promise<void> => {
        return new Promise((resolve, reject) => {
            this.setState(newState, () => {
                resolve();
            });
        });
    }

    public growlCallback = (message: GrowlMessage | GrowlMessage[]): void => {
        this.growl.current!.show(message);
    }


    // this took *hours* to track down.  do not *ever* use the index as the key
    // react will use the key to render.  say you have 3 items -- with key=0, 1, 2
    // you delete the key=1 leaving 0 and 2.  but then you run render() again and you 
    // get key 0 and 1 again ...and the item you just deleted is still referenced as item 1
    // and it'll look like you deleted the wrong item.         
    //
    //  AND!!!
    //
    //
    //  another n hours of my life I won't get back:  if you always create a uniqueId, then
    //  whenever you change state, you'll get a new object.  this manifests itself by the
    //  the form looking like TAB doesn't work.  or onBlur() doesn't work.  you type a character
    //  (which causes the <App/> to update state) and the form stops taking input
    //
    //  the solution is to store the unique name and generate one when you create a new ParameterModel
    //  
    //  leasson:  the name is really a name.  treat it like one.
    //
    public renderParameters = () => {

        let parameterList: JSX.Element[] = []
        for (let parameter of this.state.Parameters) {
            parameterList.push(

                <div className={parameter.uniqueName} key={parameter.uniqueName} ref={parameter.uniqueName}>
                    <ParameterView Model={parameter} Name={parameter.uniqueName} GrowlCallback={this.growlCallback} />
                </div>

            )
        }
        return parameterList;

    }
    //
    //  if we have parameters, ask the user if they really want to create a new file
    //  note that we have some async stuff going on.  we'll resturn from this function
    //  and the answer to the dialog comes back to this.yesNoReset
    private onNew = async () => {

        if (this.state.Parameters.length > 0) {
            const msg: string = "Create a new bash file?";
            const obj: object = { dialogMessage: msg, dialogVisible: true, dialogCallback: this.yesNoReset };
            await this.setStateAsync(obj);
        }
        else {
            this.reset();
        }
    }

    private yesNoReset = async (response: "yes" | "no") => {
        this.setState({ dialogVisible: false });
        if (response === "yes") {
            this.reset();
        }
    }
    private onErrorClicked = (e: React.MouseEvent<HTMLDivElement>, item: IErrorMessage) => {
        if (this.state.selectedError !== undefined) {
            this.state.selectedError.selected = false;
        }
        item.selected = true;
        this.setState({ selectedError: item });
        if (item.Parameter !== undefined) {
            item.Parameter.focus();
        }

    }
    private onErrorDoubleClicked = (e: React.MouseEvent<HTMLDivElement>, item: IErrorMessage) => {
        if (item.Parameter !== undefined) {
            item.Parameter.focus();
        }
    }
    public render = () => {

        const mode: string = this.state.mode === "dark" ? "cobalt" : "xcode";

        return (
            <div className="outer-container" id="outer-container">
                <Growl ref={this.growl} />
                <YesNoDialog visible={this.state.dialogVisible} message={"Create new bash file?"} Notify={this.state.dialogCallback} />
                <div id="DIV_LayoutRoot" className="DIV_LayoutRoot">
                    <SplitPane className="Splitter" split="horizontal" defaultSize={"50%"} /* primary={"second"} */ onDragFinished={(newSize: number) => {
                        //
                        //  we need to send a windows resize event so that the Ace Editor will change its viewport to match its new size
                        window.dispatchEvent(new Event('resize'));

                    }} >
                        <div className="DIV_Top">
                            <Toolbar className="toolbar" id="toolbar">
                                <div className="p-toolbar-group-left">

                                    {/* need to use standard button here because Prime Icons doesn't have a good "New File" icon */}

                                    <button className="bw-button p-component" onClick={this.onNew}>
                                        <img className="bw-button-icon" srcSet={svgFiles.FileNewBlack} />
                                        <span className="bw-button-span p-component">New Script</span>
                                    </button>

                                    <Button className="p-button-secondary" disabled={this.state.activeTabIndex > 1} label="Refresh" icon="pi pi-refresh" onClick={this.onRefresh} style={{ marginRight: '.25em' }} />
                                    <Button className="p-button-secondary" label="Add Parameter" icon="pi pi-plus" onClick={() => this.addParameter(new ParameterModel(), true)} style={{ marginRight: '.25em' }} />
                                    <Button className="p-button-secondary" label="Delete Parameter" icon="pi pi-trash" onClick={async () => await this.menuDeleteParameter()} style={{ marginRight: '.25em' }} />
                                    <Button className="p-button-secondary" label="Add" icon="pi pi-list" onClick={this.addBuiltIn} />
                                    <Dropdown options=
                                        {
                                            [
                                                { label: "All Built Ins", value: "All" },
                                                { label: "Verbose", value: "verboseParameter" },
                                                { label: "Input File Support", value: "inputFileParameter" },
                                                { label: "Logging Support", value: "loggingParameter" },
                                                { label: "Create, Verify, Delete", value: "cvdParameters" }
                                            ]
                                        }
                                        placeholder="Select Parameter"
                                        style={{ width: "165px", marginLeft: "5px" }}
                                        value={this.state.builtInParameterSelected}
                                        onChange={(e: { originalEvent: Event, value: any }) => this.setState({ builtInParameterSelected: e.value })}
                                    />
                                </div>
                                <div className="p-toolbar-group-right">
                                    <ToggleButton className="p-button-secondary" onIcon="pi pi-circle-on" onLabel="Dark Mode" offIcon="pi pi-circle-off" offLabel="Light Mode"
                                        checked={this.state.mode === "dark"}
                                        onChange={async (e: { originalEvent: Event, value: boolean }) => {
                                            await this.setStateAsync({ mode: e.value ? "dark" : "light" });
                                            this.saveSettings();
                                            this.growlCallback({ severity: "info", summary: "Bash Wizard", detail: "Only the editor has been themed so far." });
                                        }}
                                        style={{ marginRight: '.25em' }} />
                                    <Button className="p-button-secondary" label="" icon="pi pi-question" onClick={() => window.open("https://github.com/joelong01/Bash-Wizard")} style={{ marginRight: '.25em' }} />
                                </div>
                            </Toolbar>
                            {/* this is the section for entering script name and description */}
                            <div className="DIV_globalEntry">
                                <div className="p-grid grid-global-entry">
                                    <div className="p-col-fixed column-global-entry">
                                        <span className="p-float-label">
                                            <InputText id="scriptName" className="param-input" spellCheck={false} value={this.state.ScriptName} onChange={this.changedScriptName}
                                                onBlur={async (e: React.FocusEvent<InputText & HTMLInputElement>) => {
                                                    const end: string = e.currentTarget.value!.slice(-3);
                                                    if (end !== ".sh" && end !== "") {
                                                        this.growlCallback({ severity: "warn", summary: "Bash Wizard", detail: "Adding .sh to the end of your script name." });
                                                        await this.setStateAsync({ ScriptName: e.currentTarget.value + ".sh" });
                                                        // tslint:disable-next-line
                                                        this.clearErrorsAndValidateParameters(ValidationOptions.ClearErrors | ValidationOptions.Growl);
                                                        await this.updateAllText();
                                                    }
                                                }}
                                            />
                                            <label htmlFor="scriptName" className="param-label">Script Name</label>
                                        </span>
                                    </div>
                                    <div className="p-col-fixed column-global-entry">
                                        <span className="p-float-label">
                                            <InputText className="param-input" id="description_input" spellCheck={false} value={this.state.Description} onChange={this.changedDescription} />
                                            <label className="param-label" htmlFor="description_input" >Description</label>
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {/* this is the section for parameter list */}
                            <div className="Parameter_List" style={{ height: this.state.parameterListHeight }}>
                                {this.renderParameters()}
                            </div>
                        </div>
                        {/* this is the section for the area below the splitter */}
                        <TabView id="tabControl" className="tabControl" activeIndex={this.state.activeTabIndex} onTabChange={((e: { originalEvent: Event, index: number }) => this.setState({ activeTabIndex: e.index }))}>
                            <TabPanel header="Bash Script">
                                <div className="divEditor">
                                    <AceEditor mode="sh" name="aceBashEditor" theme={mode} className="aceBashEditor bw-ace" showGutter={true} showPrintMargin={false}
                                        value={this.state.bash}
                                        setOptions={{ autoScrollEditorIntoView: false, highlightActiveLine: true, fontSize: 14, }}
                                        onChange={(newVal: string) => {
                                            this.setState({ bash: newVal });
                                        }}
                                    />
                                </div>
                            </TabPanel >
                            <TabPanel header="JSON" >
                                <div className="divEditor">
                                    <AceEditor mode="sh" name="aceJSON" theme={mode} className="aceJSONEditor bw-ace" showGutter={true} showPrintMargin={false}
                                        value={this.state.json}
                                        setOptions={{ autoScrollEditorIntoView: false, highlightActiveLine: true, fontSize: 14 }}
                                        onChange={(newVal: string) => {
                                            this.setState({ json: newVal });
                                        }}
                                    />
                                </div>
                            </TabPanel >
                            <TabPanel header="VS Code Debug Config" >
                                <div className="divEditor">
                                    <AceEditor mode="sh" name="aceJSON" theme={mode} className="aceJSONEditor bw-ace" showGutter={true} showPrintMargin={false}
                                        value={this.state.debugConfig}
                                        readOnly={true}
                                        setOptions={{ autoScrollEditorIntoView: false, highlightActiveLine: true, fontSize: 14 }}
                                    />
                                </div>
                            </TabPanel >
                            <TabPanel header="Input JSON" >
                                <div className="divEditor">
                                    <AceEditor mode="sh" name="aceJSON" theme={mode} className="aceJSONEditor bw-ace" showGutter={true} showPrintMargin={false}
                                        value={this.state.inputJson}
                                        readOnly={true}
                                        setOptions={{ autoScrollEditorIntoView: false, highlightActiveLine: true, fontSize: 14 }}
                                    />
                                </div>
                            </TabPanel >
                            <TabPanel header={`Messages (${this.state.errors.length})`}>
                                <div className="bw-error-list" >
                                    <div className="bw-error-header">
                                        <span className="bw-error-span error-col1">Severity</span>
                                        <span className="bw-error-span error-col2">Message</span>
                                    </div>
                                    {
                                        this.state.errors.map((item: IErrorMessage) => {
                                            let className: string = "bw-error-item";
                                            if (this.state.selectedError === item) {
                                                className += " bw-error-item-selected";
                                            }


                                            return (
                                                <div className={className} key={item.key}
                                                    onClick={(e: React.MouseEvent<HTMLDivElement>) => { this.onErrorClicked(e, item) }}>
                                                    <span className="bw-error-span error-col1" key={item.key + ".col1"} >{item.severity}</span>
                                                    <span className="bw-error-span error-col2" key={item.key + ".col2"} >{item.message}</span>
                                                </div>
                                            )
                                        })
                                    }
                                </div>
                            </TabPanel >
                        </TabView>
                    </SplitPane>
                </div >
            </div >
        );
    }

    private async bashToUi(bash: string): Promise<void> {
        const parser: ParseBash = new ParseBash();
        const state: IParseState = parser.fromBash(bash);
        if (state.Parameters.length > 0) {
            this.UserCode = state.UserCode;
            this.builtInParameters = state.builtInParameters;
            for (let p of state.Parameters) {
                p.registerNotify(this.onPropertyChanged);
                p.uniqueName = uniqueId("PARAMETER_DIV_")
                p.selected = false;
            }
            await this.setStateAsync({
                Parameters: state.Parameters,
                ScriptName: state.ScriptName,
                Description: state.Description,
                errors: state.ParseErrors
            });

            await this.updateAllText();

        }
    }

    private async jsonToUi(json: string): Promise<void> {
        try {
            //
            //  do it in this order in case the json parse throws, we don't wipe any UI
            const objs = JSON.parse(json);
            this.reset()
            this._loading = true;
            await this.setStateAsync({
                ScriptName: objs.ScriptName,
                Description: objs.Description,
            });
            //
            //  these unserialized things are only partially ParameterModels -- create the real ones
            const params: ParameterModel[] = [];
            for (let p of objs.Parameters) {
                let model: ParameterModel = new ParameterModel();
                model.default = p.Default;
                model.description = p.Description;
                model.longParameter = p.LongParameter;
                model.valueIfSet = p.ValueIfSet;
                model.oldValueIfSet = "";
                model.selected = false;
                model.requiredParameter = p.RequiredParameter;
                model.shortParameter = p.ShortParameter;
                model.variableName = p.VariableName;
                model.requiresInputString = p.RequiresInputString;
                params.push(model)
            }
            await this.setStateAsync({ Parameters: params })
            this._loading = false;
            this.state.Parameters[0].selected = true;
        }
        catch (e) {
            this.setState({ bash: "Error parsing JSON" + e.message });
        }
        finally {
            this._loading = false;
            await this.updateAllText();

        }

    }

}

export default App;
