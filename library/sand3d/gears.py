"""Тест: пара шестерён на стальной плите, малая крутит большую (передача 2:1)."""
import sand3d as s3d


def build():
    plate = s3d.box("plate", 260, 160, 10)
    s3d.material(plate, "brushed_steel")
    big = s3d.at(s3d.gear("big", 40, 3, 12, bore=10), x=-40, z=10)
    small = s3d.at(s3d.gear("small", 20, 3, 12, bore=8), x=50, z=10)
    s3d.material(big, "brass")
    s3d.material(small, "steel")
    s3d.joint("small_spin", small, s3d.bbox(plate, "+Z").move(x=50), axis="+Z", kind="continuous")
    s3d.joint("big_spin", big, s3d.bbox(plate, "+Z").move(x=-40), axis="+Z", follows="small_spin", ratio=-0.5)
    s3d.pose(small, 30)
    return s3d.assembly("gears", plate, big, small)
