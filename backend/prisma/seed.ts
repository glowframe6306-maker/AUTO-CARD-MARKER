import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("ChangeMe123!", 12);

  const roles = [
    { name: "OWNER", label: "Owner" },
    { name: "SUPER_ADMIN", label: "Super Admin" },
    { name: "ADMINISTRATOR", label: "Administrator" },
    { name: "ADMIN", label: "Admin" },
    { name: "MEMBER", label: "Member" },
  ];

  await prisma.role.createMany({ data: roles, skipDuplicates: true });

  const permissions = [
    { name: "manage_members", description: "View and manage members" },
    { name: "manage_payments", description: "Create and edit payments" },
    { name: "manage_cards", description: "Upload and process card images" },
    { name: "manage_ocr", description: "Review OCR results" },
    { name: "manage_approvals", description: "Approve owner requests" },
    { name: "manage_users", description: "Create and manage users" },
    { name: "view_audit_logs", description: "View audit logs" },
    { name: "manage_system", description: "Manage system settings and backups" },
    { name: "view_reports", description: "View reports" },
    { name: "view_security", description: "View security center" },
  ];

  await prisma.permission.createMany({ data: permissions, skipDuplicates: true });

  const allRoles = await prisma.role.findMany();
  const allPermissions = await prisma.permission.findMany();

  const ownerRole = allRoles.find((role) => role.name === "OWNER");
  const superAdminRole = allRoles.find((role) => role.name === "SUPER_ADMIN");
  const administratorRole = allRoles.find((role) => role.name === "ADMINISTRATOR");
  const adminRole = allRoles.find((role) => role.name === "ADMIN");
  const memberRole = allRoles.find((role) => role.name === "MEMBER");

  if (ownerRole && allPermissions.length) {
    const ownerPermissions = allPermissions.map((permission) => ({ roleId: ownerRole.id, permissionId: permission.id }));
    await prisma.rolePermission.createMany({ data: ownerPermissions, skipDuplicates: true });
  }

  if (superAdminRole && allPermissions.length) {
    const superAdminPermissions = allPermissions.filter((permission) => permission.name !== "manage_system");
    await prisma.rolePermission.createMany({ data: superAdminPermissions.map((permission) => ({ roleId: superAdminRole.id, permissionId: permission.id })), skipDuplicates: true });
  }

  if (administratorRole) {
    const adminPermissions = ["manage_members", "manage_payments", "manage_cards", "manage_ocr", "view_reports", "view_security", "manage_approvals"];
    await prisma.rolePermission.createMany({ data: allPermissions.filter((permission) => adminPermissions.includes(permission.name)).map((permission) => ({ roleId: administratorRole.id, permissionId: permission.id })), skipDuplicates: true });
  }

  if (adminRole) {
    const adminPermissions = ["manage_members", "manage_payments", "manage_cards", "manage_ocr", "view_reports"];
    await prisma.rolePermission.createMany({ data: allPermissions.filter((permission) => adminPermissions.includes(permission.name)).map((permission) => ({ roleId: adminRole.id, permissionId: permission.id })), skipDuplicates: true });
  }

  if (memberRole) {
    const memberPermissions = ["view_reports"];
    await prisma.rolePermission.createMany({ data: allPermissions.filter((permission) => memberPermissions.includes(permission.name)).map((permission) => ({ roleId: memberRole.id, permissionId: permission.id })), skipDuplicates: true });
  }

  const ownerUser = await prisma.user.upsert({
    where: { accountId: "owner" },
    update: {},
    create: {
      accountId: "owner",
      email: "owner@zahira.edu.lk",
      fullName: "System Owner",
      passwordHash: password,
      status: "ACTIVE",
      isOwner: true,
      forcePasswordReset: true,
      roles: {
        create: [{ role: { connect: { name: "OWNER" } } }],
      },
    },
  });

  const memberUser = await prisma.user.upsert({
    where: { accountId: "member01" },
    update: {},
    create: {
      accountId: "member01",
      email: "member01@zahira.edu.lk",
      fullName: "Demo Member",
      passwordHash: password,
      status: "ACTIVE",
      forcePasswordReset: true,
      roles: {
        create: [{ role: { connect: { name: "MEMBER" } } }],
      },
      memberProfile: {
        create: {
          memberId: "RC001",
          fullName: "Demo Member",
          grade: "Grade 10",
          position: "Reader",
          status: "ACTIVE",
        },
      },
    },
  });

  await prisma.academicYear.upsert({
    where: { year: 2026 },
    update: {},
    create: {
      year: 2026,
      name: "2026",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.000Z"),
      isCurrent: true,
    },
  });

  await prisma.paymentRule.upsert({
    where: { id: 1 },
    update: {},
    create: {
      weeklyAmount: 50,
      weeksPerMonth: 4,
      active: true,
    },
  });

  console.log("Seed data created.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
