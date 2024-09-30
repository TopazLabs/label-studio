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

[How to Migrate]: https://chatgpt.com/share/66faf3d6-1b9c-8003-9cdf-ba779397a779
