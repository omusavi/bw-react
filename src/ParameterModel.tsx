import { GrowlMessage } from 'primereact/growl';

type INotifyPropertyChanged = (parameter: ParameterModel, property: string) => void;
export type IGrowlCallback = (message: GrowlMessage | GrowlMessage[]) => void; 


//
//  these need to JSON.stringify the same as https://github.com/joelong01/Bash-Wizard/blob/master/bashGeneratorSharedModels/ParameterItem.cs
export class ParameterModel {


    private Default: string = "";
    private Description: string = "";
    private LongParameter: string = "";
    private RequiresInputString: boolean = false;
    private RequiredParameter: boolean = false;
    private ShortParameter: string = "";
    private VariableName: string = "";
    private ValueIfSet: string = "";
    private propertyChangedNotify: INotifyPropertyChanged[] = []
    //
    // not stringified
    private _selected: boolean = false;
    private _uniqueName: string;

    // we set valueIfSet to $2 when requiresInputString is set.  we save the old value in case the user de-selects the option    
    private _oldValueIfSet: string = "";
    get oldValueIfSet(): string {
        return this._oldValueIfSet;
    }

    set oldValueIfSet(value: string) {
        if (value !== this._oldValueIfSet) {

            this._oldValueIfSet = value;

        }
    }

    public focus = () =>{
        this.NotifyPropertyChanged("focus");
    }


    // we set oldDefault to "" when they select "requires input string"
    private _oldDefault: string = "";
    get oldDefault(): string {
        return this._oldDefault;
    }

    set oldDefault(value: string) {
        if (value !== this._oldValueIfSet) {
            this._oldDefault = value;
        }
    }

    //
    //  this is an "opt in" replacer -- if you want something in the json you have to add it here
    public static jsonReplacer(name: string, value: any) {
        if (name === "Default" || name === "Description" || name === "LongParameter" || name === "RequiresInputString" || name === "RequiredParameter" || name === "ShortParameter" || name === "VariableName" || name === "ValueIfSet") {
            return value;
        }
        return undefined;
    }

    public registerNotify(callback: INotifyPropertyChanged) {
        this.propertyChangedNotify.push(callback);

    }
    public removeNotify(callback: INotifyPropertyChanged) {
        const index: number = this.propertyChangedNotify.indexOf(callback)
        if (index === -1) {
            throw new Error("attempt to remove a callback that wasn't in the callback array")
        }
        this.propertyChangedNotify.splice(index, 1)

    }
    public NotifyPropertyChanged(property: string): void {
        for (const notify of this.propertyChangedNotify) {
            notify(this, property)
        }

    }

    get default(): string {
        return this.Default;
    }

    set default(value: string) {
        if (value !== this.Default) {

            this.Default = value;
            this.NotifyPropertyChanged("default")
        }
    }

    get uniqueName(): string {
        return this._uniqueName;
    }

    set uniqueName(value: string) {
        if (value !== this._uniqueName) {

            this._uniqueName = value;
            // uniqueName does not need to be propagated
            // this.NotifyPropertyChanged("uniqueName")
        }
    }

    get selected(): boolean {
        return this._selected;
    }

    set selected(value: boolean) {
        if (value !== this._selected) {

            this._selected = value;
            this.NotifyPropertyChanged("selected")
        }
    }

    public get description(): string {
        return this.Description;
    }
    public set description(value: string) {
        if (value !== this.Description) {
            this.Description = value;
            this.NotifyPropertyChanged("description")
        }
    }
    public get longParameter(): string {
        return this.LongParameter;
    }
    public set longParameter(value: string) {
        if (value !== this.LongParameter) {
            this.LongParameter = value.replace(new RegExp(/^-{2}/, "i"), "");
            this.NotifyPropertyChanged("longParameter")
        }
    }

    public get shortParameter(): string {
        return this.ShortParameter;
    }
    public set shortParameter(value: string) {
        if (value !== this.ShortParameter) {
            this.ShortParameter = value.replace(new RegExp(/^-{1}/, "i"), "");
            this.NotifyPropertyChanged("shortParameter")
        }
    }

    public get requiresInputString(): boolean {
        return this.RequiresInputString;
    }
    public set requiresInputString(value: boolean) {
        if (value !== this.RequiresInputString) {
            this.RequiresInputString = value;
            this.NotifyPropertyChanged("requiresInputString")
        }
    }

    public get requiredParameter(): boolean {
        return this.RequiredParameter;
    }
    public set requiredParameter(value: boolean) {
        if (value !== this.RequiredParameter) {
            this.RequiredParameter = value;
            this.NotifyPropertyChanged("requiredParameter")
        }
    }

    get variableName(): string {
        return this.VariableName;
    }

    set variableName(value: string) {
        if (value !== this.VariableName) {
            this.VariableName = value;
            this.NotifyPropertyChanged("variableName")
        }
    }
    get valueIfSet(): string {
        return this.ValueIfSet;
    }

    set valueIfSet(value: string) {
        if (value !== this.ValueIfSet) {
            this.ValueIfSet = value;
            this.NotifyPropertyChanged("valueIfSet")
        }
    }

}

export default ParameterModel;