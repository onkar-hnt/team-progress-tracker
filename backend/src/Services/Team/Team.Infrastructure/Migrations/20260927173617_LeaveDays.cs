using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Team.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class LeaveDays : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LeaveDays",
                schema: "team",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeveloperId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LeaveDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    RecordedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LeaveDays", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LeaveDays_Developers_DeveloperId",
                        column: x => x.DeveloperId,
                        principalSchema: "team",
                        principalTable: "Developers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "UX_LeaveDays_DeveloperId_LeaveDate",
                schema: "team",
                table: "LeaveDays",
                columns: new[] { "DeveloperId", "LeaveDate" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LeaveDays",
                schema: "team");
        }
    }
}
