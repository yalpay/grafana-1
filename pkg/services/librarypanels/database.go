package librarypanels

import (
	"context"
	"time"

	"github.com/grafana/grafana/pkg/models"
	"github.com/grafana/grafana/pkg/services/sqlstore"
)

// createLibraryPanel adds a LibraryPanel.
func (lps *LibraryPanelService) createLibraryPanel(c *models.ReqContext, cmd AddLibraryPanelCommand) (LibraryPanel, error) {
	panel := LibraryPanel{
		OrgID:     c.SignedInUser.OrgId,
		FolderID:  cmd.FolderID,
		Title:     cmd.Title,
		Model:     cmd.Model,
		Created:   time.Now(),
		Updated:   time.Now(),
		CreatedBy: c.SignedInUser.UserId,
		UpdatedBy: c.SignedInUser.UserId,
	}
	if err := lps.SQLStore.WithTransactionalDbSession(context.Background(), func(session *sqlstore.DBSession) error {
		if res, err := session.Query("SELECT 1 from library_panel WHERE org_id=? and folder_id=? and title=?",
			c.SignedInUser.OrgId, cmd.FolderID, cmd.Title); err != nil {
			return err
		} else if len(res) == 1 {
			return errLibraryPanelAlreadyAdded
		}

		// TODO
		// check if user has rights

		if _, err := session.Insert(&panel); err != nil {
			return err
		}

		return nil
	}); err != nil {
		return panel, err
	}

	return panel, nil
}
