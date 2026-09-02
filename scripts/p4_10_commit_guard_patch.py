from pathlib import Path

path = Path('src/profile-media-api.js')
text = path.read_text(encoding='utf-8')

old = '''    if (!updatedUsers[0]) {\n      await destroyOwnedProfileMedia(env, uploadedDescriptor).catch(() => null);\n      uploadedDescriptor = null;\n      return jsonError("Foto profil belum dapat disimpan.", 500);\n    }\n\n    if (\n      previousDescriptor &&\n      previousDescriptor.publicId !== uploadedDescriptor.publicId\n    ) {\n      await destroyOwnedProfileMedia(env, previousDescriptor).catch(error => {\n        console.error("Old profile media cleanup failed:", error);\n      });\n    }\n\n    return Response.json(\n'''

new = '''    if (!updatedUsers[0]) {\n      await destroyOwnedProfileMedia(env, uploadedDescriptor).catch(() => null);\n      uploadedDescriptor = null;\n      return jsonError("Foto profil belum dapat disimpan.", 500);\n    }\n\n    // Database sekarang sudah menunjuk ke asset baru. Sejak titik ini,\n    // outer catch tidak boleh membersihkan asset yang sudah committed.\n    const committedDescriptor = uploadedDescriptor;\n    uploadedDescriptor = null;\n\n    if (\n      previousDescriptor &&\n      previousDescriptor.publicId !== committedDescriptor.publicId\n    ) {\n      await destroyOwnedProfileMedia(env, previousDescriptor).catch(error => {\n        console.error("Old profile media cleanup failed:", error);\n      });\n    }\n\n    return Response.json(\n'''

if text.count(old) != 1:
    raise SystemExit(f'commit guard target mismatch: {text.count(old)} matches')
text = text.replace(old, new, 1)

old2 = '''  if (!descriptor || descriptor.publicId !== expectedPublicId) {\n    if (descriptor) {\n      await destroyOwnedProfileMedia(env, descriptor).catch(() => null);\n    }\n    console.error("Profile media provider returned unexpected ownership metadata.");\n    return { ok: false, response: jsonError("Foto profil gagal diverifikasi.", 502) };\n  }\n'''

new2 = '''  if (!descriptor || descriptor.publicId !== expectedPublicId) {\n    // public_id berasal dari nilai server-side yang kita generate sendiri.\n    // Bersihkan asset walau URL provider ternyata malformed/tidak lolos parser.\n    await destroyOwnedProfileMedia(env, { publicId: expectedPublicId }).catch(() => null);\n    console.error("Profile media provider returned unexpected ownership metadata.");\n    return { ok: false, response: jsonError("Foto profil gagal diverifikasi.", 502) };\n  }\n'''

if text.count(old2) != 1:
    raise SystemExit(f'provider verification cleanup target mismatch: {text.count(old2)} matches')
text = text.replace(old2, new2, 1)

path.write_text(text, encoding='utf-8')
print('P4.10 commit guard patch applied.')
