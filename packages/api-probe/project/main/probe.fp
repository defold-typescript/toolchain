#version 140

in mediump vec2 var_texcoord0;

out vec4 out_fragColor;

uniform mediump sampler2D texture_sampler;
uniform fs_uniforms
{
    mediump vec4 tints[4];
};

void main()
{
    mediump vec4 tint = tints[0] * tints[1] * tints[2] * tints[3];
    out_fragColor = texture(texture_sampler, var_texcoord0.xy) * tint;
}
