import React, { useCallback, useContext, useEffect, useState } from "react";
import { Button } from "../../components";
import { Form, Input, Label, Select, TextArea } from "../../components/Form";
import { RadioGroup } from "../../components/Form/Elements/RadioGroup/RadioGroup";
import { ProjectContext } from "../../providers/ProjectProvider";
import { Block, cn, Elem } from "../../utils/bem";
import { EnterpriseBadge } from "../../components/Badges/Enterprise";
import "./settings.scss";
import { HeidiTips } from "../../components/HeidiTips/HeidiTips";
import { FF_LSDV_E_297, isFF } from "../../utils/feature-flags";
import { createURL } from "../../components/HeidiTips/utils";
import { Caption } from "../../components/Caption/Caption";
import { ApiContext } from "../../providers/ApiProvider";

export const GeneralSettings = () => {
  const { project, fetchProject } = useContext(ProjectContext);
  const api = useContext(ApiContext);

  const colors = ["#FDFDFC", "#FF4C25", "#FF750F", "#ECB800", "#9AC422", "#34988D", "#617ADA", "#CC6FBE"];

  const samplings = [
    { value: "Sequential", label: "Sequential", description: "Tasks are ordered by Data manager ordering" },
    { value: "Uniform", label: "Random", description: "Tasks are chosen with uniform random" },
  ];
  const [currentUser, setCurrentUser] = useState(null);
  const [projectGroups, setProjectGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState(project?.groups ?? []);

  useEffect(() => {
    setSelectedGroups(project?.groups ?? []);
  }, [project]);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const data = await api.callApi("me", {});
        setCurrentUser(data);
      } catch (err) {
        console.error("Failed to fetch current user:", err);
      }
    };
    fetchCurrentUser();
  }, []);

  const [showGroupInput, setShowGroupInput] = useState(false);
  const [groupInputValue, setGroupInputValue] = useState('');
  const [groupSuggestions, setGroupSuggestions] = useState([]);

  const updateProject = useCallback(async (formData) => {
    try {
      console.log("formData", formData);
      await api.callApi('updateProject', {
        params: { pk: project.id },
        body: formData,
      });
      fetchProject(project.id, true);
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  }, [project]);

  
  useEffect(() => {
    const fetchProjectGroups = async () => {
      try {
        const data = await api.callApi("projectGroups", {});
        setProjectGroups(data ?? []);
      } catch (err) {
        console.error("Failed to fetch project groups:", err);
      }
    };
    fetchProjectGroups();
  }, []);

  const toggleGroupInput = () => {
    setShowGroupInput(true);
    setGroupInputValue('');
  };

  const handleGroupInputChange = (e) => {
    const value = e.target.value;
    setGroupInputValue(value);

    const suggestions = projectGroups
      .filter((g) => g.name.toLowerCase().startsWith(value.toLowerCase()) && !selectedGroups.includes(g.id))
      .slice(0, 5);
    setGroupSuggestions(suggestions);
    console.log("suggestions", suggestions);
  };

  const handleGroupInputBlur = async () => {
    if (groupInputValue) {
      const existingGroup = projectGroups.find(
        (g) => g.name.toLowerCase() === groupInputValue.toLowerCase(),
      );
      if (existingGroup) {
        addGroup(existingGroup.id);
      } else {
        await createGroup(groupInputValue);
      }
    }

    setShowGroupInput(false);
    setGroupInputValue('');
    setGroupSuggestions([]);
  };

  const handleGroupInputKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleGroupInputBlur();
    }
  };

  const selectGroupSuggestion = (group) => {
    addGroup(group.id);
    console.log("selected group", group);
    setShowGroupInput(false);
    setGroupInputValue('');
    setGroupSuggestions([]);
  };

  const addGroup = (groupId) => {
    if (!selectedGroups.includes(groupId)) {
      setSelectedGroups([...selectedGroups, groupId]);
    }
  };

  const removeGroup = (groupId) => {
    setSelectedGroups(selectedGroups.filter((id) => id !== groupId));
  };

  const createGroup = async (groupName) => {

    try {
      const newGroup = await api.callApi("createProjectGroup", {
        method: "POST",
        body: { name: groupName },
      });
      setProjectGroups([...projectGroups, newGroup[0]]);
      addGroup(newGroup[0].id);
    } catch (err) {
      console.error("Failed to create new group:", err);
    }
  };

  return (
    <Block name="general-settings">
      <Elem name={"wrapper"}>
        <h1>General Settings</h1>
        <Block name="settings-wrapper">
        <Form
          action="updateProject"
          formData={{...project}}
          params={{ pk: project.id }}
          onSubmit={(formData) => {
            // Include only the necessary fields in the form data
            const updatedData = {
              title: formData.title,
              description: formData.description,
              groups: selectedGroups,
              color: formData.color,
              sampling: formData.sampling,
            };
            console.log("updatedData", updatedData);
            updateProject(updatedData);
          }}
          >
            <Form.Row columnCount={1} rowGap="16px">
              <Input name="title" label="Project Name" />

              <TextArea name="description" label="Description" style={{ minHeight: 128 }} />

              {/* Project Groups Component */}
              <Block name="project-groups">
                <Label style={{display: "block", marginBottom: "8px", padding: "8px 0px"}}>Groups</Label>
                <Block name="selected-groups">
                  {selectedGroups.map((groupId) => {
                    const group = projectGroups.find((g) => g.id === groupId);
                    return (
                      <Elem name="group" key={groupId} className="group-item">
                        {group ? group.name : "Unknown Group"}
                        <Button type="button" onClick={() => removeGroup(groupId)} className="remove-group-button">
                          x
                        </Button>
                      </Elem>
                    );
                  })}
                  <Button type="button" onClick={toggleGroupInput} className="add-group-button">
                    +
                  </Button>
                </Block>
                {showGroupInput && (
                  <div className="group-input-container">
                    <Input
                      value={groupInputValue}
                      onChange={handleGroupInputChange}
                      onBlur={handleGroupInputBlur}
                      onKeyPress={handleGroupInputKeyPress}
                      autoFocus
                      className="group-input"
                    />
                    {groupSuggestions.length > 0 && (
                      <Block name="group-suggestions" className="group-suggestions">
                        {groupSuggestions.map((suggestion) => (
                          <Elem
                            name="suggestion"
                            key={suggestion.id}
                            onMouseDown={(e) => e.preventDefault()} // Prevent onBlur from hiding suggestions
                            onMouseUp={() => selectGroupSuggestion(suggestion)}
                            className="group-suggestion"
                          >
                            {suggestion.name}
                          </Elem>
                        ))}
                      </Block>
                    )}
                  </div>
                )}
              </Block>

              <RadioGroup
                name="color"
                label="Color"
                size="large"
                labelProps={{ size: "large" }}
              >
                {colors.map((color) => (
                  <RadioGroup.Button key={color} value={color}>
                    <Block name="color" style={{ "--background": color }} />
                  </RadioGroup.Button>
                ))}
              </RadioGroup>

              <RadioGroup
                label="Task Sampling"
                labelProps={{ size: "large" }}
                name="sampling"
                simple
              >
                {samplings.map(({ value, label, description }) => (
                  <RadioGroup.Button
                    key={value}
                    value={`${value} sampling`}
                    label={`${label} sampling`}
                    description={description}
                  />
                ))}
                {isFF(FF_LSDV_E_297) && (
                  <RadioGroup.Button
                    key="uncertainty-sampling"
                    value=""
                    label={
                      <>
                        Uncertainty sampling 
                        <EnterpriseBadge />
                      </>
                    }
                    disabled
                    description={
                      <>
                        Tasks are chosen according to model uncertainty score (active learning mode).{" "}
                        <a
                          target="_blank"
                          href={createURL("https://docs.humansignal.com/guide/active_learning", {
                            experiment: "project_settings_workspace",
                            treatment: "workspaces",
                          })}
                          rel="noreferrer"
                        >
                          Learn more
                        </a>
                      </>
                    }
                  />
                )}
              </RadioGroup>
            </Form.Row>

            <Form.Actions>
              <Form.Indicator>
                <span case="success">Saved!</span>
              </Form.Indicator>
              <Button type="submit" look="primary" style={{ width: 120 }}>
                Save
              </Button>
            </Form.Actions>
          </Form>
        </Block>
      </Elem>
      {isFF(FF_LSDV_E_297) && <HeidiTips collection="projectSettings" />}
    </Block>
  );
};

GeneralSettings.menuItem = "General";
GeneralSettings.path = "/";
GeneralSettings.exact = true;
