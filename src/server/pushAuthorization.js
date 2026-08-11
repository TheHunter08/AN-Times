export function actorCanNotify(actor, targetUserId) {
  if (!actor || !targetUserId) return false
  if (['admin', 'jefe_obra', 'encargado'].includes(actor.role)) return targetUserId !== '__all__'
  return targetUserId === actor.id || targetUserId === '__admin__'
}
