import chr from "chroma-js";
import React, { useMemo, useState, useEffect, useContext } from "react";
import { NavLink } from "react-router-dom";
import { LsBulb, LsCheck, LsEllipsis, LsMinus } from "../../assets/icons";
import { Button, Dropdown, Menu, Pagination, Userpic } from "../../components";
import { Block, Elem } from "../../utils/bem";
import "./Projects.scss";
import { format } from "date-fns";

const DEFAULT_CARD_COLORS = ["#FFFFFF", "#F5F5F5"]; // Update with your actual default colors

export const ProjectsList = ({
  projectGroups,
  groupedProjects,
  ungroupedProjects,
  onGroupDrop,
  currentPage,
  totalItems,
  loadNextPage,
  pageSize,
}) => {
  /** Handle drag events */
  const handleDragStart = (e, groupId) => {
    e.dataTransfer.setData("draggedGroupId", groupId);
    setTimeout(() => {
      e.target.classList.add("dragging");
    }, 0);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add("drag-over");
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove("drag-over");
  };

  const handleDrop = (e, targetGroupId) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");
    const draggedGroupId = e.dataTransfer.getData("draggedGroupId");

    const mouseY = e.clientY;

    // Get the target group's position
    const targetElement = e.currentTarget;
    const targetRect = targetElement.getBoundingClientRect();
    const targetMidpoint = targetRect.top + targetRect.height / 2;

    const dropkey = mouseY < targetMidpoint ? "next" : "prev";

    onGroupDrop(draggedGroupId, targetGroupId, dropkey);
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove("dragging");
  };


  const allProjectsSection = (
    <ProjectGroupSection
      key="all"
      group={{ id: "all", name: "All Projects" }}
      projects={[...new Set([...ungroupedProjects, ...Object.values(groupedProjects).flat()])]}
      draggable={false}
    />
  );

  return (
    <Block name="projects-list">
      {projectGroups.filter(group => groupedProjects[group.id] && groupedProjects[group.id].length > 0).map((group, index) => (
        <ProjectGroupSection
          key={group.id}
          group={group}
          projects={groupedProjects[group.id] || []}
          onDragStart={(e) => handleDragStart(e, group.id)}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, group.id)}
          onDragEnd={handleDragEnd}
          index={index}
          draggable
        />
      ))}
      {ungroupedProjects.length > 0 && (
        <ProjectGroupSection
          group={{ id: "ungrouped", name: "Ungrouped Projects" }}
          projects={ungroupedProjects}
          draggable={false}
        />
      )}
      {allProjectsSection}
      <Pagination
        page={currentPage}
        totalItems={totalItems}
        urlParamName="page"
        pageSize={pageSize}
        onChange={loadNextPage}
      />
    </Block>
  );
};
const ProjectGroupSection = ({
  group,
  projects,
  index = -1,
  draggable = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) => {
  const [isOpen, setIsOpen] = useState(index === 0);

  return (
    <Block
      name="project-group-section"
      mod={{ draggable }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <Elem name="header" onClick={() => setIsOpen(!isOpen)}>
        <Elem name="title">{group?.name ?? "loading..."}</Elem>
        <Elem name="toggle">{isOpen ? "▼" : "►"}</Elem>
      </Elem>
      {isOpen && (
        <Elem name="projects">
          <Elem name="project-list">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </Elem>
        </Elem>
      )}
    </Block>
  );
};

const ProjectCard = ({ project }) => {
  const color = useMemo(() => {
    return DEFAULT_CARD_COLORS.includes(project.color) ? null : project.color;
  }, [project]);

  const projectColors = useMemo(() => {
    return color
      ? {
          "--header-color": color,
          "--background-color": chr(color).alpha(0.2).css(),
        }
      : {};
  }, [color]);

  return (
    <Elem tag={NavLink} name="link" to={`/projects/${project.id}/data`} data-external>
      <Block name="project-card" mod={{ colored: !!color }} style={projectColors}>
        <Elem name="header">
          <Elem name="title">
            <Elem name="title-text">{project.title ?? "New project"}</Elem>

            <Elem
              name="menu"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
            >
              <Dropdown.Trigger
                content={
                  <Menu contextual>
                    <Menu.Item href={`/projects/${project.id}/settings`}>Settings</Menu.Item>
                    <Menu.Item href={`/projects/${project.id}/data?labeling=1`}>Label</Menu.Item>
                  </Menu>
                }
              >
                <Button size="small" type="text" icon={<LsEllipsis />} />
              </Dropdown.Trigger>
            </Elem>
          </Elem>
          <Elem name="summary">
            <Elem name="annotation">
              <Elem name="total">
                {project.finished_task_number} / {project.task_number}
              </Elem>
              <Elem name="detail">
                <Elem name="detail-item" mod={{ type: "completed" }}>
                  <Elem tag={LsCheck} name="icon" />
                  {project.total_annotations_number}
                </Elem>
                <Elem name="detail-item" mod={{ type: "rejected" }}>
                  <Elem tag={LsMinus} name="icon" />
                  {project.skipped_annotations_number}
                </Elem>
                <Elem name="detail-item" mod={{ type: "predictions" }}>
                  <Elem tag={LsBulb} name="icon" />
                  {project.total_predictions_number}
                </Elem>
              </Elem>
            </Elem>
          </Elem>
        </Elem>
        <Elem name="description">{project.description}</Elem>
        <Elem name="info">
          <Elem name="created-date">{format(new Date(project.created_at), "dd MMM ’yy, HH:mm")}</Elem>
          <Elem name="created-by">
            <Userpic src="#" user={project.created_by} showUsername />
          </Elem>
        </Elem>
      </Block>
    </Elem>
  );
};

export const EmptyProjectsList = ({ openModal }) => {
  return (
    <Block name="empty-projects-page">
      {/* Customize this component according to your application's needs */}
      <Elem name="header" tag="h1">
        No projects found!
      </Elem>
      <p>Create one and start labeling your data.</p>
      <Elem name="action" tag={Button} onClick={openModal} look="primary">
        Create Project
      </Elem>
    </Block>
  );
};