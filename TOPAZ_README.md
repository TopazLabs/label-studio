# Topaz Labs Label Studio

![Topaz Labs](https://cdn.prod.website-files.com/6005fac27a49a9cd477afb63/661f051456d1ac2bfcf19296_giga-fullui-1-p-1600.jpg)

## Quickstart

### 1. Building the container:

```bash 
docker build -t topaz-label-studio .
``` 

### 2. Running the container:
```bash 
docker compose up
``` 

### 3. Running the web web app from bash:
```bash 
bash /home/starkiller/dev/label-studio/run_app.sh
``` 


## Engineering Documentation

Label Studio's label interface are created using an XML markup. E.g:

```xml
  <View>
    <Choices name="model_selected" toName="image_sync">
      <View style="margin-bottom: 20px;">
        <Choice alias="0/2" value="Choose if you think the reference image is better"/>
      </View>
      <View style="margin-bottom: 20px;">
        <Choice alias="1/2" value="Choose if you think the first enhanced image is better"/>
      </View>
      <View style="margin-bottom: 20px;">
        <Choice alias="2/2" value="Choose if you think the second enhanced image is better"/>
      </View>
    </Choices>
  </View>
```


### Registering a Custom Frontend Component

The labeling frontend is parsed from a XML markup. In order to add custom components to the frontend one must follow the according steps. In this example we will demonstrate how to add this component `CustomComponent` to the XML:

```xml
<CustomComponent
 title="My Title"
 description="Some description..."
 max_value=5
/>
```


#### Step 1: Create the Component

First, create a new file for your custom component, for example, `CustomComponent.jsx` in the appropriate directory (likely in `web/libs/editor/src/components/`):

```jsx
import React, { Component } from 'react';
import { observer } from "mobx-react";
import { Block } from "../../utils/bem";

class CustomComponent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      count: 0
    };
  }

  componentDidMount() {
    console.log("Custom title:", this.props.item.title);
    console.log("Max value:", this.props.item.max_value);
  }

  handleIncrement = () => {
    this.setState(prevState => ({
      count: Math.min(prevState.count + 1, this.props.item.max_value)
    }));
  }

  render() {
    const { title, description } = this.props.item;
    return (
      <Block name="custom-component">
        <h2>{title}</h2>
        <p>{description}</p>
        <p>Count: {this.state.count}</p>
        <button onClick={this.handleIncrement}>Increment</button>
      </Block>
    );
  }
}

export default observer(CustomComponent);
```

#### Step 2: Create the Model

In the appropriate file (likely in `web/libs/editor/src/tags/object/`), create a model for your component:

```javascript
import { types } from "mobx-state-tree";
import Registry from "../../../core/Registry";
import { AnnotationMixin } from "../../../mixins/AnnotationMixin";
import { IsReadyWithDepsMixin } from "../../../mixins/IsReadyMixin";

const CustomComponentModel = types.compose(
  "CustomComponentModel",
  types.model({
    type: "customcomponent",
    title: types.string,
    description: types.optional(types.string, ""),
    max_value: types.optional(types.number, 10)
  }),
  AnnotationMixin,
  IsReadyWithDepsMixin
)
.views((self) => ({
  get store() {
    return getRoot(self);
  },
}))
.actions((self) => ({
  setTitle(title) {
    self.title = title;
  },
  setMaxValue(value) {
    self.maxValue = value;
  }
}));

```

#### Step 3: Register the Component and Model

In the same file where you defined the model, add the following code to register your component:

```javascript
import CustomComponent from "../../components/CustomComponent";

const HtxCustomComponent = inject("store")(CustomComponent);

Registry.addTag("customcomponent", CustomComponentModel, HtxCustomComponent);
Registry.addObjectType(CustomComponentModel);

export { CustomComponentModel, HtxCustomComponent };
```

#### Step 4: Update the schema

Update the `label_config_schema.json` file in `label_studio/core/utils/schema/` to include your new component:

```json
"CustomComponent": {
  "type": "object",
  "required": ["@name", "@title"],
  "properties": {
    "@name": {
      "$ref": "#/definitions/@name"
    },
    "@title": {
      "type": "string"
    },
    "@description": {
      "type": "string"
    },
    "@maxValue": {
      "type": "number"
    }
  }
}
```

#### Step 5: Update the Config

In `web/apps/labelstudio/src/pages/CreateProject/Config/schema.json`, add your new component:

```json
"CustomComponent": {
  "name": "CustomComponent",
  "description": "A custom component with a title, description, and max value",
  "attrs": {
    "title": {
      "type": "string",
      "required": true,
      "description": "Title of the custom component"
    },
    "description": {
      "type": "string",
      "description": "Description of the custom component"
    },
    "maxValue": {
      "type": "number",
      "description": "Maximum value for the counter"
    }
  }
}
```

Also, in the same file edit the View children list to include it:
```json
"View": {
        // ... Existing definitions...
    "children": [
        // ... existing children ...
        "CustomComponent",
        // ... Rest of existing children ...
    ],
    // ... Rest of existing definitions ...
}
```

#### Step 6: Add to Object Types

In `web/apps/labelstudio/src/pages/CreateProject/Config/tags.js`, add your component to the `OBJECTS` constant:

```javascript
CustomComponent: {
  type: "CustomComponent",
  settings: {
    title: {
      title: "Title",
      type: String,
      param: ($obj, value) => $obj.setAttribute("title", value),
      value: ($obj) => $obj.getAttribute("title"),
    },
    description: {
      title: "Description",
      type: String,
      param: ($obj, value) => $obj.setAttribute("description", value),
      value: ($obj) => $obj.getAttribute("description"),
    },
    maxValue: {
      title: "Max Value",
      type: Number,
      param: ($obj, value) => $obj.setAttribute("maxValue", value),
      value: ($obj) => parseInt($obj.getAttribute("maxValue") || 10),
    },
  },
}
```

#### Step 7: Export the Component

In `web/libs/editor/src/tags/object/index.js`, export your new component:

```javascript
export { CustomComponentModel } from "./CustomComponent";
```

#### Step 8: Add the child type to the View Model

In `web/libs/editor/src/tags/visual/View.jsx`, add the following to the children union types:

```javascript
const Model = types.model({
  id: types.identifier,
  type: "view",
  children: Types.unionArray([
    // ... Previous types ...
    "customcomponent",
    // ... Rest of the types ...
  ]),
});
```


Example usage:

```xml
<View>
  <ImageSync 
    name="image_sync"
    image0="$image_path"
    image1="$enhanced_image_path1"
    image2="$enhanced_image_path2"
  />
</View>
```
