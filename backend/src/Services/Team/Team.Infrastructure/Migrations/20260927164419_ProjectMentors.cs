using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Team.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ProjectMentors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProjectMentors",
                schema: "team",
                columns: table => new
                {
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MentorId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectMentors", x => new { x.ProjectId, x.MentorId });
                    table.ForeignKey(
                        name: "FK_ProjectMentors_Mentors_MentorId",
                        column: x => x.MentorId,
                        principalSchema: "team",
                        principalTable: "Mentors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectMentors_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "team",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMentors_MentorId",
                schema: "team",
                table: "ProjectMentors",
                column: "MentorId");

            // Every project that already named a mentor keeps that mentor as a
            // responsibility. Without this, moving from one mentor per project
            // to several would hide every existing project from its own mentor.
            // Soft-deleted projects are included so a restore brings the
            // responsibility back with it.
            migrationBuilder.Sql("""
                INSERT INTO [team].[ProjectMentors] (ProjectId, MentorId, CreatedAt)
                SELECT p.Id, p.MentorId, SYSDATETIMEOFFSET()
                  FROM [team].[Projects] p
                 WHERE p.MentorId IS NOT NULL
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectMentors",
                schema: "team");
        }
    }
}
