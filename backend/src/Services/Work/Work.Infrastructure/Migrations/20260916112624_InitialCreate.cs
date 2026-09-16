using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Work.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "work");

            migrationBuilder.CreateTable(
                name: "RecordHistory",
                schema: "work",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TableName = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    RecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Subject = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false, defaultValue: ""),
                    SubjectDeveloperId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ChangedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ChangedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false, defaultValue: ""),
                    ChangedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Changes = table.Column<string>(type: "nvarchar(max)", nullable: false, defaultValue: "{}")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecordHistory", x => x.Id);
                    table.CheckConstraint("CK_RecordHistory_Action", "[Action] IN ('create', 'update', 'delete', 'restore')");
                    table.CheckConstraint("CK_RecordHistory_TableName", "[TableName] IN ('daily_updates', 'developers', 'feedback', 'mentors', 'projects', 'tasks')");
                });

            migrationBuilder.CreateTable(
                name: "Tasks",
                schema: "work",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeveloperId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MentorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Priority = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "medium"),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "not-started"),
                    CreatedDate = table.Column<DateOnly>(type: "date", nullable: false, defaultValueSql: "CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'UTC' AS date)"),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: true),
                    EstimatedHours = table.Column<decimal>(type: "decimal(6,2)", precision: 6, scale: 2, nullable: true),
                    ActualHours = table.Column<decimal>(type: "decimal(7,2)", precision: 7, scale: 2, nullable: false, defaultValue: 0m),
                    WorkedDays = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeletedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tasks", x => x.Id);
                    table.CheckConstraint("CK_Tasks_EstimatedHours", "[EstimatedHours] IS NULL OR [EstimatedHours] >= 0");
                    table.CheckConstraint("CK_Tasks_Priority", "[Priority] IN ('low', 'medium', 'high', 'critical')");
                    table.CheckConstraint("CK_Tasks_Status", "[Status] IN ('not-started', 'in-progress', 'completed', 'blocked')");
                });

            migrationBuilder.CreateTable(
                name: "DailyUpdates",
                schema: "work",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeveloperId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TaskId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EntryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    TaskTitle = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    WorkDone = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PlannedWork = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "in-progress"),
                    Priority = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "medium"),
                    Progress = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    HoursSpent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: true),
                    EstimatedHours = table.Column<decimal>(type: "decimal(6,2)", precision: 6, scale: 2, nullable: true),
                    IsBlocked = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    BlockerDescription = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Remarks = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeletedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyUpdates", x => x.Id);
                    table.CheckConstraint("CK_DailyUpdates_EstimatedHours", "[EstimatedHours] IS NULL OR [EstimatedHours] >= 0");
                    table.CheckConstraint("CK_DailyUpdates_HoursSpent", "[HoursSpent] IS NULL OR [HoursSpent] >= 0");
                    table.CheckConstraint("CK_DailyUpdates_Priority", "[Priority] IN ('low', 'medium', 'high', 'critical')");
                    table.CheckConstraint("CK_DailyUpdates_Progress", "[Progress] >= 0 AND [Progress] <= 100");
                    table.CheckConstraint("CK_DailyUpdates_Status", "[Status] IN ('not-started', 'in-progress', 'completed', 'blocked')");
                    table.ForeignKey(
                        name: "FK_DailyUpdates_Tasks_TaskId",
                        column: x => x.TaskId,
                        principalSchema: "work",
                        principalTable: "Tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "Feedback",
                schema: "work",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    DeveloperId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MentorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TaskId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FeedbackDate = table.Column<DateOnly>(type: "date", nullable: false, defaultValueSql: "CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'UTC' AS date)"),
                    Comment = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ProgressUpdate = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Blockers = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Recommendations = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AuthorProfileId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AuthorRole = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeletedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Feedback", x => x.Id);
                    table.CheckConstraint("CK_Feedback_AuthorRole", "[AuthorRole] IN ('admin', 'mentor', 'developer')");
                    table.ForeignKey(
                        name: "FK_Feedback_Tasks_TaskId",
                        column: x => x.TaskId,
                        principalSchema: "work",
                        principalTable: "Tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DailyUpdates_DeletedAt",
                schema: "work",
                table: "DailyUpdates",
                column: "DeletedAt",
                filter: "[DeletedAt] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_DailyUpdates_DeveloperId_EntryDate",
                schema: "work",
                table: "DailyUpdates",
                columns: new[] { "DeveloperId", "EntryDate" });

            migrationBuilder.CreateIndex(
                name: "IX_DailyUpdates_EntryDate",
                schema: "work",
                table: "DailyUpdates",
                column: "EntryDate");

            migrationBuilder.CreateIndex(
                name: "IX_DailyUpdates_IsBlocked",
                schema: "work",
                table: "DailyUpdates",
                column: "IsBlocked",
                filter: "[IsBlocked] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_DailyUpdates_ProjectId",
                schema: "work",
                table: "DailyUpdates",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_DailyUpdates_TaskId",
                schema: "work",
                table: "DailyUpdates",
                column: "TaskId",
                filter: "[TaskId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Feedback_Code",
                schema: "work",
                table: "Feedback",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Feedback_DeletedAt",
                schema: "work",
                table: "Feedback",
                column: "DeletedAt",
                filter: "[DeletedAt] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Feedback_DeveloperId_FeedbackDate",
                schema: "work",
                table: "Feedback",
                columns: new[] { "DeveloperId", "FeedbackDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Feedback_MentorId",
                schema: "work",
                table: "Feedback",
                column: "MentorId");

            migrationBuilder.CreateIndex(
                name: "IX_Feedback_ProjectId",
                schema: "work",
                table: "Feedback",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_Feedback_TaskId_CreatedAt",
                schema: "work",
                table: "Feedback",
                columns: new[] { "TaskId", "CreatedAt" },
                filter: "[TaskId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_RecordHistory_ChangedAt",
                schema: "work",
                table: "RecordHistory",
                column: "ChangedAt",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "IX_RecordHistory_SubjectDeveloperId",
                schema: "work",
                table: "RecordHistory",
                column: "SubjectDeveloperId",
                filter: "[SubjectDeveloperId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_RecordHistory_TableName_RecordId",
                schema: "work",
                table: "RecordHistory",
                columns: new[] { "TableName", "RecordId" });

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_Code",
                schema: "work",
                table: "Tasks",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_DeletedAt",
                schema: "work",
                table: "Tasks",
                column: "DeletedAt",
                filter: "[DeletedAt] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_DeveloperId",
                schema: "work",
                table: "Tasks",
                column: "DeveloperId");

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_DeveloperId_Status",
                schema: "work",
                table: "Tasks",
                columns: new[] { "DeveloperId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_DueDate",
                schema: "work",
                table: "Tasks",
                column: "DueDate",
                filter: "[DueDate] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_MentorId",
                schema: "work",
                table: "Tasks",
                column: "MentorId");

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_ProjectId",
                schema: "work",
                table: "Tasks",
                column: "ProjectId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DailyUpdates",
                schema: "work");

            migrationBuilder.DropTable(
                name: "Feedback",
                schema: "work");

            migrationBuilder.DropTable(
                name: "RecordHistory",
                schema: "work");

            migrationBuilder.DropTable(
                name: "Tasks",
                schema: "work");
        }
    }
}
