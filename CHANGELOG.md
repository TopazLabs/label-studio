# Changelog

## Commits [67e5ea51e59103078d97b608d376a0446a1ef3cc,8a1f3825d3ed4a6b675d9e23e7319f4118ad3fab] - 2024-09-30

### Added
- New visualization feature for project data
  - Added VisualizationPage component
  - Implemented categorical visualization templates for attribute columns and data columns
  - Added SQL query execution for custom visualizations
- New 'Substring' filter option for string fields
- Added 'id_str' field to Task model for string representation of task ID
- Integrated plotly for data visualization

### Changed
- Increased default line height for improved accessibility
- Added option for compact line height in view settings
- Updated DataManager toolbar to include visualization button
- Enhanced data export functionality to support visualization features
- ImageSync will now display the actual viewable image dimensions (pixels w x h) being displayed, rather than the column dimensions.

### Fixed
- Improved error handling in API calls
- Fixed issues with image syncing in ImageView component
- focus issues

### Development
- Added new dependencies: matplotlib, dash, django-plotly-dash, pandasql
- Updated various package versions in poetry.lock and package.json

### Notes
- This update includes significant changes to the data visualization capabilities of the application. Users can now create custom visualizations using SQL queries and view categorical data distributions.
- The new 'id_str' field in the Task model may require a database migration.

### Commit Links:
- [**visualizations API and visual interface, can now view variable images**](https://github.com/TopazLabs/label-studio/commit/67e5ea51e59103078d97b608d376a0446a1ef3cc)
- [**ImageSync viewable data**](https://github.com/TopazLabs/label-studio/commit/8a1f3825d3ed4a6b675d9e23e7319f4118ad3fab)

### How to Migrate: 
https://chatgpt.com/share/66faf3d6-1b9c-8003-9cdf-ba779397a779


## Commits [0abf11c1e753a31dc3616f28760b9cf614b1cd52,9f89e85ff50dd2beccc7b9ca8d20917e7abc3d59,73468038651f4b1498f0da8513c74e233966b6f6] - 2024-10-04

### Added
  - Implemented project groups functionality in the GeneralSettings component
  - Added ability to view, add, and remove project groups
  - Implemented group suggestions based on user input
  - Created new API calls for fetching and managing project groups

### Changed
  - Updated the project update process in GeneralSettings
  - Modified form submission to include only necessary fields
  - Improved error handling for project updates
  - Refactored the GeneralSettings component to use React hooks more effectively
  - Implemented useEffect for fetching project groups and current user data
  - Used useState for managing component state

### Removed
- Removed unused code related to workspaces

### Development
- Added new API endpoints for project group management
- Improved state management within the GeneralSettings component

### Notes
- This update significantly enhances the project management capabilities by allowing users to organize projects into groups.
- The new group functionality may require additional testing to ensure smooth integration with existing project features.

### Commit Link:
- [**Project Groups Implementation**](https://github.com/TopazLabs/label-studio/commit/0abf11c1e753a31dc3616f28760b9cf614b1cd52)

### How to Migrate: 

1. SSH into the production server:
   ```
   ssh cyprus@delta.topazlabs.com
   ```

2. Navigate to the root directory:
   ```
   cd /
   ```

3. Create the new directory:
   ```
   sudo mkdir -p /data/label-studio-dropbox
   ```

4. Set appropriate permissions:
   ```
   sudo chmod 777 /data/label-studio-dropbox
   ```

5. Verify the directory was created successfully:
   ```
   ls -l /data/label-studio-dropbox
   ```

6. Update the environment variables:
   - Ensure you set the following environment variables in your Docker Compose file:
     ```
     BASE_DROPBOX_DIR=/data/label-studio-dropbox
     ```