using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Team.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "team");

            migrationBuilder.CreateTable(
                name: "Mentors",
                schema: "team",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ProfileId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Email = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    Active = table.Column<bool>(type: "bit", nullable: false),
                    CreatedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeletedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Mentors", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Projects",
                schema: "team",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Client = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Active = table.Column<bool>(type: "bit", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: true),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    MentorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeletedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Projects", x => x.Id);
                    table.CheckConstraint("CK_Projects_Dates", "[EndDate] IS NULL OR [StartDate] IS NULL OR [EndDate] >= [StartDate]");
                    table.CheckConstraint("CK_Projects_Status", "[Status] IN ('planned', 'active', 'on-hold', 'completed')");
                    table.ForeignKey(
                        name: "FK_Projects_Mentors_MentorId",
                        column: x => x.MentorId,
                        principalSchema: "team",
                        principalTable: "Mentors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "Developers",
                schema: "team",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ProfileId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EmployeeId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    Role = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Location = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Active = table.Column<bool>(type: "bit", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: true),
                    AccessRole = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    PrimaryProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeletedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Developers", x => x.Id);
                    table.CheckConstraint("CK_Developers_AccessRole", "[AccessRole] IS NULL OR [AccessRole] IN ('admin', 'mentor', 'developer')");
                    table.ForeignKey(
                        name: "FK_Developers_Projects_PrimaryProjectId",
                        column: x => x.PrimaryProjectId,
                        principalSchema: "team",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "MentorAssignments",
                schema: "team",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MentorId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeveloperId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AssignedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Active = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MentorAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MentorAssignments_Developers_DeveloperId",
                        column: x => x.DeveloperId,
                        principalSchema: "team",
                        principalTable: "Developers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MentorAssignments_Mentors_MentorId",
                        column: x => x.MentorId,
                        principalSchema: "team",
                        principalTable: "Mentors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectDevelopers",
                schema: "team",
                columns: table => new
                {
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeveloperId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectDevelopers", x => new { x.ProjectId, x.DeveloperId });
                    table.ForeignKey(
                        name: "FK_ProjectDevelopers_Developers_DeveloperId",
                        column: x => x.DeveloperId,
                        principalSchema: "team",
                        principalTable: "Developers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProjectDevelopers_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "team",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Developers_Active",
                schema: "team",
                table: "Developers",
                column: "Active");

            migrationBuilder.CreateIndex(
                name: "IX_Developers_Code",
                schema: "team",
                table: "Developers",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Developers_DeletedAt",
                schema: "team",
                table: "Developers",
                column: "DeletedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Developers_Email",
                schema: "team",
                table: "Developers",
                column: "Email",
                unique: true,
                filter: "[DeletedAt] IS NULL AND [Email] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Developers_EmployeeId",
                schema: "team",
                table: "Developers",
                column: "EmployeeId",
                unique: true,
                filter: "[DeletedAt] IS NULL AND [EmployeeId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Developers_PrimaryProjectId",
                schema: "team",
                table: "Developers",
                column: "PrimaryProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_Developers_ProfileId",
                schema: "team",
                table: "Developers",
                column: "ProfileId",
                unique: true,
                filter: "[ProfileId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_MentorAssignments_DeveloperId",
                schema: "team",
                table: "MentorAssignments",
                column: "DeveloperId");

            migrationBuilder.CreateIndex(
                name: "IX_MentorAssignments_MentorId_DeveloperId_Active",
                schema: "team",
                table: "MentorAssignments",
                columns: new[] { "MentorId", "DeveloperId" },
                unique: true,
                filter: "[Active] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_Mentors_Code",
                schema: "team",
                table: "Mentors",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Mentors_DeletedAt",
                schema: "team",
                table: "Mentors",
                column: "DeletedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Mentors_Email",
                schema: "team",
                table: "Mentors",
                column: "Email",
                unique: true,
                filter: "[DeletedAt] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Mentors_ProfileId",
                schema: "team",
                table: "Mentors",
                column: "ProfileId",
                unique: true,
                filter: "[ProfileId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectDevelopers_DeveloperId",
                schema: "team",
                table: "ProjectDevelopers",
                column: "DeveloperId");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_Code",
                schema: "team",
                table: "Projects",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Projects_DeletedAt",
                schema: "team",
                table: "Projects",
                column: "DeletedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_MentorId",
                schema: "team",
                table: "Projects",
                column: "MentorId");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_Status",
                schema: "team",
                table: "Projects",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MentorAssignments",
                schema: "team");

            migrationBuilder.DropTable(
                name: "ProjectDevelopers",
                schema: "team");

            migrationBuilder.DropTable(
                name: "Developers",
                schema: "team");

            migrationBuilder.DropTable(
                name: "Projects",
                schema: "team");

            migrationBuilder.DropTable(
                name: "Mentors",
                schema: "team");
        }
    }
}
