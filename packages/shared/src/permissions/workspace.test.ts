import { describe, expect, it } from 'vitest'

import { WORKSPACE_ROLES } from '../constants/domain'
import { hasRoleAtLeast, isWorkspaceAdmin, isWorkspaceMember, isWorkspaceOwner } from './roles'
import { ADMIN, matrix, MEMBER, otherMember, OUTSIDER, OWNER, subject } from './test-fixtures'
import {
  canChangeMemberRole,
  canDeleteWorkspace,
  canGrantRole,
  canInviteMember,
  canLeaveWorkspace,
  canManageMembers,
  canManageWorkspace,
  canRemoveMember,
  canRevokeInvite,
  canTransferOwnership,
  canViewWorkspace,
} from './workspace'

describe('role hierarchy', () => {
  it('orders OWNER > ADMIN > MEMBER', () => {
    expect(hasRoleAtLeast('OWNER', 'ADMIN')).toBe(true)
    expect(hasRoleAtLeast('ADMIN', 'ADMIN')).toBe(true)
    expect(hasRoleAtLeast('ADMIN', 'OWNER')).toBe(false)
    expect(hasRoleAtLeast('MEMBER', 'ADMIN')).toBe(false)
    expect(hasRoleAtLeast('MEMBER', 'MEMBER')).toBe(true)
  })

  it('never grants anything to a non-member', () => {
    for (const role of WORKSPACE_ROLES) expect(hasRoleAtLeast(null, role)).toBe(false)
  })

  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: false, OUTSIDER: false }))(
    '%s is admin: %s',
    (_name, actor, expected) => {
      expect(isWorkspaceAdmin(actor)).toBe(expected)
    },
  )

  it('identifies members and the owner', () => {
    expect(isWorkspaceMember(MEMBER)).toBe(true)
    expect(isWorkspaceMember(OUTSIDER)).toBe(false)
    expect(isWorkspaceOwner(OWNER)).toBe(true)
    expect(isWorkspaceOwner(ADMIN)).toBe(false)
  })
})

describe('workspace administration', () => {
  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: true, OUTSIDER: false }))(
    '%s can view the workspace: %s',
    (_name, actor, expected) => {
      expect(canViewWorkspace(actor)).toBe(expected)
    },
  )

  it.each(matrix({ OWNER: true, ADMIN: false, MEMBER: false, OUTSIDER: false }))(
    '%s can manage settings and delete the workspace: %s',
    (_name, actor, expected) => {
      expect(canManageWorkspace(actor)).toBe(expected)
      expect(canDeleteWorkspace(actor)).toBe(expected)
    },
  )

  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: false, OUTSIDER: false }))(
    '%s can open member management: %s',
    (_name, actor, expected) => {
      expect(canManageMembers(actor)).toBe(expected)
    },
  )
})

describe('ownership transfer', () => {
  it('lets only the owner transfer, and only to someone else', () => {
    expect(canTransferOwnership(OWNER, subject(ADMIN))).toBe(true)
    expect(canTransferOwnership(OWNER, subject(MEMBER))).toBe(true)
    expect(canTransferOwnership(OWNER, subject(OWNER))).toBe(false)
    expect(canTransferOwnership(ADMIN, subject(MEMBER))).toBe(false)
    expect(canTransferOwnership(MEMBER, subject(ADMIN))).toBe(false)
  })
})

describe('granting roles (invites and role changes)', () => {
  it('never grants OWNER — ownership only moves by transfer', () => {
    for (const actor of [OWNER, ADMIN, MEMBER, OUTSIDER]) {
      expect(canGrantRole(actor, 'OWNER')).toBe(false)
      expect(canInviteMember(actor, 'OWNER')).toBe(false)
    }
  })

  it.each(matrix({ OWNER: true, ADMIN: false, MEMBER: false, OUTSIDER: false }))(
    '%s can invite/grant ADMIN: %s',
    (_name, actor, expected) => {
      expect(canInviteMember(actor, 'ADMIN')).toBe(expected)
      expect(canRevokeInvite(actor, { role: 'ADMIN' })).toBe(expected)
    },
  )

  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: false, OUTSIDER: false }))(
    '%s can invite/grant MEMBER: %s',
    (_name, actor, expected) => {
      expect(canInviteMember(actor, 'MEMBER')).toBe(expected)
      expect(canRevokeInvite(actor, { role: 'MEMBER' })).toBe(expected)
    },
  )
})

describe('changing member roles', () => {
  it('lets the owner promote and demote between MEMBER and ADMIN', () => {
    expect(canChangeMemberRole(OWNER, otherMember('MEMBER'), 'ADMIN')).toBe(true)
    expect(canChangeMemberRole(OWNER, otherMember('ADMIN'), 'MEMBER')).toBe(true)
  })

  it('never makes anyone OWNER and never changes the owner role', () => {
    expect(canChangeMemberRole(OWNER, otherMember('ADMIN'), 'OWNER')).toBe(false)
    expect(canChangeMemberRole(OWNER, subject(OWNER), 'ADMIN')).toBe(false)
    expect(canChangeMemberRole(ADMIN, subject(OWNER), 'MEMBER')).toBe(false)
  })

  it('does not let admins change roles (that would mean managing admins)', () => {
    expect(canChangeMemberRole(ADMIN, otherMember('MEMBER'), 'ADMIN')).toBe(false)
    expect(canChangeMemberRole(ADMIN, otherMember('ADMIN'), 'MEMBER')).toBe(false)
    expect(canChangeMemberRole(ADMIN, subject(ADMIN), 'MEMBER')).toBe(false)
  })

  it('does not let members change roles', () => {
    expect(canChangeMemberRole(MEMBER, otherMember('MEMBER'), 'ADMIN')).toBe(false)
    expect(canChangeMemberRole(MEMBER, subject(MEMBER), 'ADMIN')).toBe(false)
  })
})

describe('removing members', () => {
  it('protects the owner from removal by anyone, including themselves', () => {
    for (const actor of [OWNER, ADMIN, MEMBER]) {
      expect(canRemoveMember(actor, subject(OWNER))).toBe(false)
    }
    expect(canLeaveWorkspace(OWNER)).toBe(false)
  })

  it('lets the owner remove admins and members', () => {
    expect(canRemoveMember(OWNER, otherMember('ADMIN'))).toBe(true)
    expect(canRemoveMember(OWNER, otherMember('MEMBER'))).toBe(true)
  })

  it('lets admins remove members but not other admins', () => {
    expect(canRemoveMember(ADMIN, otherMember('MEMBER'))).toBe(true)
    expect(canRemoveMember(ADMIN, otherMember('ADMIN'))).toBe(false)
  })

  it('does not let members remove anyone else', () => {
    expect(canRemoveMember(MEMBER, otherMember('MEMBER'))).toBe(false)
    expect(canRemoveMember(OUTSIDER, otherMember('MEMBER'))).toBe(false)
  })

  it('treats removing yourself as leaving', () => {
    expect(canRemoveMember(ADMIN, subject(ADMIN))).toBe(true)
    expect(canRemoveMember(MEMBER, subject(MEMBER))).toBe(true)
    expect(canLeaveWorkspace(MEMBER)).toBe(true)
    expect(canLeaveWorkspace(OUTSIDER)).toBe(false)
  })
})
