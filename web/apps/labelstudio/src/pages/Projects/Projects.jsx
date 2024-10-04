import React, { useState, useEffect, useContext, useCallback } from "react";
import { useParams as useRouterParams } from "react-router";
import { Redirect } from "react-router-dom";
import { Button } from "../../components";
import { Oneof } from "../../components/Oneof/Oneof";
import { Spinner } from "../../components/Spinner/Spinner";
import { ApiContext } from "../../providers/ApiProvider";
import { useContextProps } from "../../providers/RoutesProvider";
import { useAbortController } from "../../hooks/useAbortController";
import { Block, Elem } from "../../utils/bem";
import { FF_DEV_2575, isFF } from "../../utils/feature-flags";
import { CreateProject } from "../CreateProject/CreateProject";
import { DataManagerPage } from "../DataManager/DataManager";
import { SettingsPage } from "../Settings";
import "./Projects.scss";
import { EmptyProjectsList, ProjectsList } from "./ProjectsList";

const getCurrentPage = () => {
  const pageNumberFromURL = new URLSearchParams(location.search).get("page");
  return pageNumberFromURL ? Number.parseInt(pageNumberFromURL) : 1;
};

export const ProjectsPage = () => {
  const api = useContext(ApiContext);
  const abortController = useAbortController();
  const [projectsList, setProjectsList] = useState([]);
  const [projectGroups, setProjectGroups] = useState([]);
  const [networkState, setNetworkState] = useState(null);
  const [currentPage, setCurrentPage] = useState(getCurrentPage());
  const [totalItems, setTotalItems] = useState(1);
  const setContextProps = useContextProps();
  const defaultPageSize = Number.parseInt(localStorage.getItem("pages:projects-list") ?? 30);

  const [modal, setModal] = useState(false);
  const openModal = setModal.bind(null, true);
  const closeModal = setModal.bind(null, false);

  const [groupedProjects, setGroupedProjects] = useState({});

  /** Fetch projects from the API */
  const fetchProjects = async (page = currentPage, pageSize = defaultPageSize) => {
    setNetworkState("loading");
    abortController.renew();

    const requestParams = { page, page_size: pageSize };

    if (isFF(FF_DEV_2575)) {
      requestParams.include = [
        "id",
        "title",
        "groups",
        "created_by",
        "created_at",
        "color",
        "is_published",
        "assignment_settings",
      ].join(",");
    }

    const data = await api.callApi("projects", {
      params: requestParams,
      ...(isFF(FF_DEV_2575)
        ? {
            signal: abortController.controller.current.signal,
            errorFilter: (e) => e.error.includes("aborted"),
          }
        : null),
    });

    setTotalItems(data?.count ?? 1);
    setProjectsList(data.results ?? []);
    setNetworkState("loaded");

    if (isFF(FF_DEV_2575) && data?.results?.length) {
      const additionalData = await api.callApi("projects", {
        params: {
          ids: data?.results?.map(({ id }) => id).join(","),
          include: [
            "id",
            "description",
            "groups",
            "num_tasks_with_annotations",
            "task_number",
            "skipped_annotations_number",
            "total_annotations_number",
            "total_predictions_number",
            "ground_truth_number",
            "finished_task_number",
          ].join(","),
          page_size: pageSize,
        },
        signal: abortController.controller.current.signal,
        errorFilter: (e) => e.error.includes("aborted"),
      });

      if (additionalData?.results?.length) {
        setProjectsList((prev) =>
          additionalData.results.map((project) => {
            const prevProject = prev.find(({ id }) => id === project.id);
            return {
              ...prevProject,
              ...project,
            };
          }),
        );
      }
    }
  };

  const fetchProjectGroups = async () => {
    try {
      const data = await api.callApi("projectGroups", {
        params: {},
      });

      console.log("Fetched project groups:", data); // Log fetched data
      setProjectGroups(data ?? []);
    } catch (err) {
      console.error("Failed to fetch project groups:", err);
    }
  };

  /** Load the next page of projects */
  const loadNextPage = async (page, pageSize) => {
    setCurrentPage(page);
    await fetchProjects(page, pageSize);
  };

  /** Map projects to their groups */
  const mapProjectsToGroups = useCallback(() => {
    const grouped = {};

    projectsList.forEach((project) => {
      if (project.groups && project.groups.length > 0) {
        project.groups.forEach((groupId) => {
          if (!grouped[groupId]) {
            grouped[groupId] = [];
          }
          grouped[groupId].push(project);
        });
      } else {
        if (!grouped["ungrouped"]) {
          grouped["ungrouped"] = [];
        }
        grouped["ungrouped"].push(project);
      }
    });

    setGroupedProjects(grouped);
  }, [projectsList]);

  /** Handle drag-and-drop operations */
  const handleGroupDrop = async (draggedGroupId, targetGroupId, dropkey) => {
    if (draggedGroupId === targetGroupId) return;

    // Prepare the operation data
    const operationData = {
      op: "move",
      id: parseInt(draggedGroupId),
    };

    operationData[dropkey] = parseInt(targetGroupId);
    
    try {
      // Update the backend
      await api.callApi("groupOperations", {
        method: "POST",
        body: operationData,
      });

      // Fetch updated groups
      await fetchProjectGroups();
    } catch (err) {
      console.error("Failed to update group order:", err);
    }
  };

  /** Initial data fetching */
  useEffect(() => {
    fetchProjects();
    fetchProjectGroups();
  }, []);

  useEffect(() => {
    mapProjectsToGroups();
  }, [projectsList, mapProjectsToGroups]);


  /** Update context props */
  useEffect(() => {
    setContextProps({ openModal, showButton: projectsList.length > 0 });
  }, [projectsList.length]);

  // Verify that projectGroups state is being set correctly
  // useEffect(() => {
  //   console.log("Updated project groups:", projectGroups);
  //   console.log("Updated projects grouped:", groupedProjects);
  // }, [projectGroups, groupedProjects]);

  return (
    <Block name="projects-page">
      <Oneof value={networkState}>
        <Elem name="loading" case="loading">
          <Spinner size={64} />
        </Elem>
        <Elem name="content" case="loaded">
          {projectsList.length ? (
            <ProjectsList
              projectGroups={projectGroups}
              groupedProjects={groupedProjects}
              ungroupedProjects={groupedProjects["ungrouped"] || []}
              onGroupDrop={handleGroupDrop}
              currentPage={currentPage}
              totalItems={totalItems}
              loadNextPage={loadNextPage}
              pageSize={defaultPageSize}
            />
          ) : (
            <EmptyProjectsList openModal={openModal} />
          )}
          {modal && <CreateProject onClose={closeModal} />}
        </Elem>
      </Oneof>
    </Block>
  );
};

ProjectsPage.title = "Projects";
ProjectsPage.path = "/projects";
ProjectsPage.exact = true;
ProjectsPage.routes = ({ store }) => [
  {
    title: () => store.project?.title,
    path: "/:id(\\d+)",
    exact: true,
    component: () => {
      const params = useRouterParams();

      return <Redirect to={`/projects/${params.id}/data`} />;
    },
    pages: {
      DataManagerPage,
      SettingsPage,
    },
  },
];
ProjectsPage.context = ({ openModal, showButton }) => {
  if (!showButton) return null;
  return (
    <Button onClick={openModal} look="primary" size="compact">
      Create
    </Button>
  );
};