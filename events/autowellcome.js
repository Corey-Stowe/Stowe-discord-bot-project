module.exports = {
	name: "guildMemberAdd", // This event is called whenever a new member joins the server.
	async execute(member) {
        console.log("loaded")
        const wellcomerole = member.guild.roles.cache.find(role => role.name === "Member");
        await member.roles.add(wellcomerole);
        const wellcomechannel = member.guild.channels.cache.find(channel => channel.name === "﹒welcome");
        await wellcomechannel.fetch();
        wellcomechannel.send(`Welcome to the server, ${member.user}!`);
    },
};