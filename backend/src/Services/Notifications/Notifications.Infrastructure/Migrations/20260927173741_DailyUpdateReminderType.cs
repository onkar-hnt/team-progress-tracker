using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Notifications.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DailyUpdateReminderType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Notifications_Type",
                schema: "notify",
                table: "Notifications");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Notifications_Type",
                schema: "notify",
                table: "Notifications",
                sql: "[Type] IN ('daily_update_reminder', 'daily_update_submitted', 'feedback_added', 'task_assigned', 'task_comment_added', 'task_reassigned', 'task_status_changed', 'work_blocked')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Notifications_Type",
                schema: "notify",
                table: "Notifications");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Notifications_Type",
                schema: "notify",
                table: "Notifications",
                sql: "[Type] IN ('daily_update_submitted', 'feedback_added', 'task_assigned', 'task_comment_added', 'task_reassigned', 'task_status_changed', 'work_blocked')");
        }
    }
}
