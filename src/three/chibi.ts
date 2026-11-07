import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * Chibi look for VRoid models, made at load time (the .vrm files stay as they are): a bigger head, bigger eyes
 * and a shorter trunk, arms and legs. Moving a bone's rest position stretches or squashes the skin between joints
 * without making it thinner, so the limbs get short and stubby the way chibi figures are.
 * All 1 = the model as it was made.
 */
export const CHIBI = {
  enabled: true,
  head: 1.7, // head (with hair, face, hats) scale
  eyes: 1.3, // irises and their highlights
  trunk: 0.75, // hips to neck
  arms: 0.75, // shoulder to wrist
  legs: 0.6, // hip to ankle
};

export function applyChibi(vrm: VRM, c = CHIBI) {
  if (!c.enabled) return;
  const raw = (n: VRMHumanBoneName) => vrm.humanoid.getRawBoneNode(n);
  const shorten = (k: number, ...names: VRMHumanBoneName[]) => {
    for (const n of names) raw(n)?.position.multiplyScalar(k);
  };
  shorten(c.trunk, 'spine', 'chest', 'upperChest', 'neck');
  shorten(c.legs, 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot');
  shorten(c.arms, 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand');
  raw('head')?.scale.setScalar(c.head);
  // the eye bones sit inside the scaled head: scale the irises on top of that
  for (const n of ['leftEye', 'rightEye'] as const) raw(n)?.scale.setScalar(c.eyes);
  vrm.scene.updateMatrixWorld(true);
  vrm.springBoneManager?.setInitState();
  vrm.springBoneManager?.reset();
}

