using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Notifications.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "notify");

            migrationBuilder.CreateTable(
                name: "Notifications",
                schema: "notify",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RecipientProfileId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Message = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    EntityType = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    EntityId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsRead = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Notifications", x => x.Id);
                    table.CheckConstraint("CK_Notifications_EntityType", "[EntityType] IS NULL OR [EntityType] IN ('daily_update', 'feedback', 'task')");
                    table.CheckConstraint("CK_Notifications_Type", "[Type] IN ('daily_update_submitted', 'feedback_added', 'task_assigned', 'task_comment_added', 'task_reassigned', 'task_status_changed', 'work_blocked')");
                });

            migrationBuilder.CreateTable(
                name: "UserPreferences",
                schema: "notify",
                columns: table => new
                {
                    ProfileId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MutedNotificationTypes = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserPreferences", x => x.ProfileId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_RecipientProfileId",
                schema: "notify",
                table: "Notifications",
                column: "RecipientProfileId",
                filter: "[IsRead] = 0");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_RecipientProfileId_CreatedAt",
                schema: "notify",
                table: "Notifications",
                columns: new[] { "RecipientProfileId", "CreatedAt" },
                descending: new[] { false, true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Notifications",
                schema: "notify");

            migrationBuilder.DropTable(
                name: "UserPreferences",
                schema: "notify");
        }
    }
}
